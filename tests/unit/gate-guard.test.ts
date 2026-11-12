import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GateGuardHook } from "../../src/hooks/custom/gate-guard.js";

describe("GateGuardHook", () => {
    let dir: string;
    const hook = new GateGuardHook();
    const ctx = () => ({ sessionID: "s", directory: dir, sessions: new Map() }) as never;
    const run = (tool: string, args: Record<string, unknown>) => hook.execute(ctx(), tool, args);
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "codegate-guard-")); });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    it("blocks the agent from approving its own gates", async () => {
        for (const command of [
            "node ~/.config/opencode/skills/unlazy/scripts/gate-check.mjs --approve GATES.md",
            "node gate-check.mjs GATES.md --approve",
            "UNLAZY_APPROVAL_DIR=/tmp/x node gate-check.mjs GATES.md",
            "cat > ~/.unlazy/approved/abc.json",
        ]) {
            expect((await run("shell", { command })).action).toBe("block");
        }
    });

    it("lets the agent run gate-check without approving", async () => {
        const r = await run("shell", { command: "node ~/.config/opencode/skills/unlazy/scripts/gate-check.mjs GATES.md" });
        expect(r.action).toBe("allow");
    });

    it("lets the first draft of GATES.md be written, then freezes it", async () => {
        expect((await run("write", { filePath: join(dir, "GATES.md"), content: "x" })).action).toBe("allow");
        writeFileSync(join(dir, "GATES.md"), "x");
        for (const tool of ["write", "edit", "patch"]) {
            expect((await run(tool, { filePath: join(dir, "GATES.md") })).action).toBe("block");
        }
    });

    it("never lets an agent write the subagent-run record", async () => {
        expect((await run("write", { filePath: join(dir, ".codegate", "subagent_runs.jsonl") })).action).toBe("block");
        expect((await run("shell", { command: "echo {} >> .codegate/subagent_runs.jsonl" })).action).toBe("block");
    });

    it("allows ordinary edits and commands", async () => {
        expect((await run("edit", { filePath: join(dir, "src/a.ts") })).action).toBe("allow");
        expect((await run("shell", { command: "npm test" })).action).toBe("allow");
    });
});
