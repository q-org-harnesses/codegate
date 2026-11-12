/**
 * Gate verification (CodeGate).
 *
 * A mission that has a GATES.md ledger is complete only when unlazy's own
 * `gate-check --reverify` re-runs every approved gate command and prints
 * ALL MET. The agent's claim, a ticked box or an evidence line it wrote itself
 * never counts: evidence is bound to the approved command and re-executed here.
 *
 * Fail closed: a missing checker, a timeout, an unapproved ledger or any
 * unexpected output is a failure.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { verifyMissionCompletion } from "./verification.js";
import type { VerificationResult } from "../../shared/index.js";

export const LEDGER_FILE = "GATES.md";
const DEFAULT_TIMEOUT_MS = 900_000;
/** Per-gate limit passed to gate-check (its own default is 120 s, too short for a build or a full test run). */
const PER_GATE_TIMEOUT_S = 600;
const MAX_ERRORS = 8;
const MAX_LINE = 240;

export interface GateOptions {
    /** Fail when no ledger exists. Defaults to CODEGATE_REQUIRE_GATES=1. */
    requireGates?: boolean;
    /** Directory holding unlazy (scripts/gate-check.mjs). Defaults to CODEGATE_UNLAZY_DIR or the OpenCode skill. */
    unlazyDir?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
}

export interface GateVerification {
    /** A ledger file exists in the project. */
    present: boolean;
    passed: boolean;
    errors: string[];
    /** Some gate command has no Owner approval yet. */
    awaitingApproval?: boolean;
}

/** The host may embed the runtime (OpenCode's process.execPath is the opencode binary), so only trust execPath when it is node. */
export function nodeBinary(env: NodeJS.ProcessEnv, execPath: string = process.execPath): string {
    if (env.CODEGATE_NODE) return env.CODEGATE_NODE;
    return /^node(\.exe)?$/i.test(basename(execPath)) ? execPath : "node";
}

function defaultUnlazyDir(env: NodeJS.ProcessEnv): string {
    return env.CODEGATE_UNLAZY_DIR ?? join(homedir(), ".config/opencode/skills/unlazy");
}

/** Strip terminal controls so ledger-controlled text cannot reach the model as formatting. */
function clean(line: string): string {
    // eslint-disable-next-line no-control-regex
    return line.replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, "").trim().slice(0, MAX_LINE);
}

function failureLines(stdout: string, stderr: string): string[] {
    const lines = `${stdout}\n${stderr}`.split("\n").map(clean).filter(Boolean);
    const interesting = lines.filter(l => /^(FAIL|UNMET|APPROVAL REQUIRED|HANDOFF|ERROR|STALE)/i.test(l));
    const picked = interesting.length > 0 ? interesting : lines.slice(-3);
    return picked.slice(0, MAX_ERRORS);
}

export async function verifyGates(directory: string, options: GateOptions = {}): Promise<GateVerification> {
    const env = options.env ?? process.env;
    const required = options.requireGates ?? env.CODEGATE_REQUIRE_GATES === "1";
    const ledgerPath = join(directory, LEDGER_FILE);
    const present = existsSync(ledgerPath);

    if (!present) {
        return required
            ? { present, passed: false, errors: [`${LEDGER_FILE} is required but missing: write the gates and have the Owner approve them`] }
            : { present, passed: true, errors: [] };
    }

    const gateCheck = join(options.unlazyDir ?? defaultUnlazyDir(env), "scripts", "gate-check.mjs");
    if (!existsSync(gateCheck)) {
        return { present, passed: false, errors: [`gate-check not found at ${gateCheck}; cannot verify ${LEDGER_FILE}`] };
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise<GateVerification>(resolve => {
        execFile(
            nodeBinary(env),
            [gateCheck, "--reverify", "--timeout", String(PER_GATE_TIMEOUT_S), LEDGER_FILE],
            { cwd: directory, env, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" },
            (error, stdout, stderr) => {
                const out = String(stdout ?? "");
                if (!error && /ALL MET/.test(out)) {
                    resolve({ present, passed: true, errors: [] });
                    return;
                }
                if (error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed) {
                    resolve({ present, passed: false, errors: [`gate-check timed out after ${timeoutMs} ms`] });
                    return;
                }
                const lines = failureLines(out, String(stderr ?? ""));
                resolve({
                    present,
                    passed: false,
                    errors: lines.length > 0 ? lines : ["gate-check did not report ALL MET"],
                    awaitingApproval: /^\s*APPROVAL REQUIRED/m.test(out),
                });
            },
        );
    });
}

/**
 * Mission completion with gates. If a ledger exists (or is required) it is
 * authoritative over the TODO and checklist files; otherwise the stock verifier decides.
 */
export async function verifyMissionWithGates(directory: string, options: GateOptions = {}): Promise<VerificationResult> {
    const base = verifyMissionCompletion(directory);
    const gates = await verifyGates(directory, options);
    const env = options.env ?? process.env;
    const required = options.requireGates ?? env.CODEGATE_REQUIRE_GATES === "1";
    if (!gates.present && !required) return base;
    return { ...base, passed: gates.passed, errors: gates.errors, awaitingApproval: gates.awaitingApproval === true };
}
