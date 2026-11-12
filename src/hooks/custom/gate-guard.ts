/**
 * Gate Guard Hook (CodeGate)
 *
 * Defence in depth around the gate ledger. The real protection is unlazy's
 * approval and evidence binding (an edited command loses its approval and the
 * plugin re-runs the gates itself); this hook refuses the obvious shortcuts
 * early, so the agent gets a clear message instead of a silent failure:
 *
 *  - approving gates (`--approve`, the approval store, UNLAZY_APPROVAL_DIR):
 *    only the Owner side approves;
 *  - rewriting GATES.md once it exists: the first draft may be written, after
 *    that the ledger is frozen for agents;
 *  - writing the subagent-run record under .codegate/, which only the plugin writes.
 */

import { existsSync } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import type { PreToolUseHook, HookContext, PreToolResult, ToolInput } from "../registry.js";
import { TOOL_NAMES } from "../../shared/index.js";
import { HOOK_ACTIONS } from "../constants.js";
import { LEDGER_FILE } from "../../core/loop/gates.js";

const WRITE_TOOLS = new Set(["write", "edit", "patch"]);
const PATH_KEYS = ["filePath", "filepath", "file_path", "path", "file"] as const;
const APPROVAL_PATTERN = /--approve\b|\.unlazy[/\\]approved|UNLAZY_APPROVAL_DIR/;
const RECORD_DIR = ".codegate";
const SHELL_WRITE_TO_RECORD = /(>|tee\b|sed\s+-i|mv\b|cp\b|rm\b|truncate\b)[^|;&]*\.codegate\b/;

const block = (reason: string): PreToolResult => ({ action: HOOK_ACTIONS.BLOCK, reason });

function targetPath(args: ToolInput): string | undefined {
    for (const key of PATH_KEYS) {
        const value = args[key];
        if (typeof value === "string" && value) return value;
    }
    return undefined;
}

export class GateGuardHook implements PreToolUseHook {
    name = "GateGuard";

    async execute(ctx: HookContext, tool: string, args: ToolInput): Promise<PreToolResult> {
        if (tool === TOOL_NAMES.SHELL) {
            const command = typeof args.command === "string" ? args.command : "";
            if (APPROVAL_PATTERN.test(command)) {
                return block("Gate approval is the Owner's: do not run --approve or touch the approval store. Ask the Owner to approve the ledger.");
            }
            if (SHELL_WRITE_TO_RECORD.test(command)) {
                return block(`${RECORD_DIR}/ is written only by the plugin.`);
            }
            return { action: HOOK_ACTIONS.ALLOW };
        }

        if (WRITE_TOOLS.has(tool)) {
            const raw = targetPath(args);
            if (!raw) return { action: HOOK_ACTIONS.ALLOW };
            const path = isAbsolute(raw) ? resolve(raw) : resolve(ctx.directory, raw);
            if (path.split(sep).includes(RECORD_DIR)) {
                return block(`${RECORD_DIR}/ is written only by the plugin.`);
            }
            if (basename(path) === LEDGER_FILE && existsSync(join(ctx.directory, LEDGER_FILE))) {
                return block(`${LEDGER_FILE} already exists and is frozen: an edit voids the Owner's approval. Ask the Owner to change it.`);
            }
        }
        return { action: HOOK_ACTIONS.ALLOW };
    }
}
