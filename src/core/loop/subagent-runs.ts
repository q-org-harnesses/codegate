/**
 * Subagent run recorder (CodeGate).
 *
 * The plugin, not the agent, writes one JSON line per native `subagent` tool
 * call to .codegate/subagent_runs.jsonl. A gate can then prove that a
 * reviewer really ran (the agent cannot forge a tool call it did not make,
 * and never writes this file). Only the agent name, ids, size and a SHA-256 of
 * the output are kept: no prompt text, no output text.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export const SUBAGENT_RUNS_FILE = ".codegate/subagent_runs.jsonl";
const AGENT_KEYS = ["agent", "subagent", "subagent_type", "subagentType", "agent_name", "agentName", "name"] as const;

export interface SubagentCall {
    sessionID: string;
    callID: string;
    tool: string;
    args: unknown;
    output: string;
}

function agentName(args: unknown): string {
    if (typeof args !== "object" || args === null) return "unknown";
    const record = args as Record<string, unknown>;
    for (const key of AGENT_KEYS) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
    }
    return "unknown";
}

export function recordSubagentRun(directory: string, call: SubagentCall): void {
    if (call.tool !== "subagent") return;
    try {
        const file = join(directory, SUBAGENT_RUNS_FILE);
        mkdirSync(dirname(file), { recursive: true });
        const row = {
            ts: new Date().toISOString(),
            sessionID: call.sessionID,
            callID: call.callID,
            agent: agentName(call.args),
            outputBytes: Buffer.byteLength(call.output ?? "", "utf8"),
            outputSha256: createHash("sha256").update(call.output ?? "").digest("hex"),
        };
        appendFileSync(file, `${JSON.stringify(row)}\n`);
    } catch {
        // Recording must never break the agent's tool call.
    }
}
