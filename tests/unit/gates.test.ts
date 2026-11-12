/**
 * Gate verification tests (CodeGate).
 *
 * These run the real unlazy gate-check against temporary ledgers, so they prove
 * that a ticked box without a passing, approved command never counts.
 * Approvals go to a throwaway directory (UNLAZY_APPROVAL_DIR), never ~/.unlazy.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { verifyGates, verifyMissionWithGates, nodeBinary } from "../../src/core/loop/gates.js";

const UNLAZY_DIR = process.env.CODEGATE_UNLAZY_DIR ?? join(homedir(), ".config/opencode/skills/unlazy");
const GATE_CHECK = join(UNLAZY_DIR, "scripts/gate-check.mjs");
const haveUnlazy = existsSync(GATE_CHECK);

const ledger = (checked: boolean, evidence: string) => `# Gates: test

- [${checked ? "x" : " "}] G1: marker file exists
  CHECK: bash -c 'test -f marker.txt && echo marker=present'
  EXPECT: marker=present
  EVIDENCE: ${evidence}
`;

describe("nodeBinary", () => {
    it("does not use an embedded host binary as node", () => {
        expect(nodeBinary({}, "/Users/x/.opencode/bin/opencode")).toBe("node");
        expect(nodeBinary({}, "/opt/homebrew/bin/node")).toBe("/opt/homebrew/bin/node");
        expect(nodeBinary({ CODEGATE_NODE: "/custom/node" }, "/x/opencode")).toBe("/custom/node");
    });
});

describe.skipIf(!haveUnlazy)("verifyGates", () => {
    let dir: string;
    let approvals: string;
    const env = () => ({ ...process.env, UNLAZY_APPROVAL_DIR: approvals });

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "codegate-gates-"));
        approvals = mkdtempSync(join(tmpdir(), "codegate-approvals-"));
        mkdirSync(join(dir, ".opencode"), { recursive: true });
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        rmSync(approvals, { recursive: true, force: true });
    });

    // --approve also runs the gates and exits 1 when one fails; the approval is recorded either way.
    const approve = () => {
        try {
            execFileSync(process.execPath, [GATE_CHECK, "--approve", "--timeout", "600", "GATES.md"], { cwd: dir, env: env(), stdio: "ignore" });
        } catch {
            /* a failing gate still records the approval */
        }
    };

    it("is not applicable without a ledger", async () => {
        const r = await verifyGates(dir, { env: env() });
        expect(r.present).toBe(false);
        expect(r.passed).toBe(true);
    });

    it("fails closed when a ledger is required but missing", async () => {
        const r = await verifyGates(dir, { requireGates: true, env: env() });
        expect(r.passed).toBe(false);
        expect(r.errors.join(" ")).toMatch(/GATES\.md/);
    });

    it("passes when an approved gate's command succeeds", async () => {
        writeFileSync(join(dir, "marker.txt"), "x");
        writeFileSync(join(dir, "GATES.md"), ledger(false, "pending"));
        approve();
        const r = await verifyGates(dir, { env: env() });
        expect(r.present).toBe(true);
        expect(r.passed).toBe(true);
    });

    it("does not accept a ticked box with forged evidence", async () => {
        writeFileSync(join(dir, "GATES.md"), ledger(true, "sha256=deadbeef; bytes=14; verified by me"));
        approve(); // the Owner approved the command; the agent never ran it
        const r = await verifyGates(dir, { env: env() });
        expect(r.passed).toBe(false);
        expect(r.errors.length).toBeGreaterThan(0);
    });

    it("fails and names the gate when the command no longer passes", async () => {
        writeFileSync(join(dir, "marker.txt"), "x");
        writeFileSync(join(dir, "GATES.md"), ledger(false, "pending"));
        approve();
        expect((await verifyGates(dir, { env: env() })).passed).toBe(true);
        rmSync(join(dir, "marker.txt"));
        const r = await verifyGates(dir, { env: env() });
        expect(r.passed).toBe(false);
        expect(r.errors.join(" ")).toMatch(/G1/);
    });

    it("fails when the ledger commands were never approved", async () => {
        writeFileSync(join(dir, "marker.txt"), "x");
        writeFileSync(join(dir, "GATES.md"), ledger(false, "pending"));
        const r = await verifyGates(dir, { env: env() });
        expect(r.passed).toBe(false);
        expect(r.errors.join(" ")).toMatch(/approv/i);
        expect(r.awaitingApproval).toBe(true);
    });

    it("does not mark a failing but approved ledger as awaiting approval", async () => {
        writeFileSync(join(dir, "GATES.md"), ledger(false, "pending"));
        approve();
        const r = await verifyGates(dir, { env: env() });
        expect(r.passed).toBe(false);
        expect(r.awaitingApproval).toBe(false);
    });

    it("fails closed when unlazy is missing", async () => {
        writeFileSync(join(dir, "GATES.md"), ledger(false, "pending"));
        const r = await verifyGates(dir, { unlazyDir: join(dir, "nope"), env: env() });
        expect(r.passed).toBe(false);
        expect(r.errors.join(" ")).toMatch(/gate-check/);
    });

    it("fails closed on timeout", async () => {
        writeFileSync(
            join(dir, "GATES.md"),
            `# Gates: slow\n\n- [ ] G1: slow\n  CHECK: bash -c 'sleep 5; echo done=1'\n  EXPECT: done=1\n  EVIDENCE: pending\n`,
        );
        approve();
        const r = await verifyGates(dir, { timeoutMs: 500, env: env() });
        expect(r.passed).toBe(false);
        expect(r.errors.join(" ")).toMatch(/timed out|timeout/i);
    });

    it("makes an existing ledger authoritative over TODO and checklist files", async () => {
        writeFileSync(join(dir, "marker.txt"), "x");
        writeFileSync(join(dir, "GATES.md"), ledger(false, "pending"));
        approve();
        // no TODO file at all: the stock verifier alone would fail this
        const r = await verifyMissionWithGates(dir, { env: env() });
        expect(r.passed).toBe(true);
    });

    it("still fails a mission whose ledger fails, even if the TODO file is all ticked", async () => {
        writeFileSync(join(dir, "GATES.md"), ledger(false, "pending"));
        writeFileSync(join(dir, ".opencode", "todo.md"), "- [x] everything\n");
        approve();
        const r = await verifyMissionWithGates(dir, { env: env() });
        expect(r.passed).toBe(false);
    });
});
