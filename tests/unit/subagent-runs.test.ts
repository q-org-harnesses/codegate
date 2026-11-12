import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recordSubagentRun, SUBAGENT_RUNS_FILE } from "../../src/core/loop/subagent-runs.js";

describe("recordSubagentRun", () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "codegate-runs-")); });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    const read = () => readFileSync(join(dir, SUBAGENT_RUNS_FILE), "utf8").trim().split("\n").map(l => JSON.parse(l));

    it("records agent, session and output fingerprint for a subagent call", () => {
        recordSubagentRun(dir, { sessionID: "s1", callID: "c1", tool: "subagent", args: { agent: "code-reviewer", prompt: "review the diff" }, output: "Findings: none" });
        const [row] = read();
        expect(row.agent).toBe("code-reviewer");
        expect(row.sessionID).toBe("s1");
        expect(row.outputBytes).toBe(14);
        expect(row.outputSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(row)).not.toContain("review the diff");
    });

    it("accepts the other argument spellings", () => {
        for (const key of ["subagent", "subagent_type", "agent_name", "name"]) {
            recordSubagentRun(dir, { sessionID: "s", callID: key, tool: "subagent", args: { [key]: "Reviewer" }, output: "x" });
        }
        expect(read().map(r => r.agent)).toEqual(["Reviewer", "Reviewer", "Reviewer", "Reviewer"]);
    });

    it("ignores tools that are not subagent calls", () => {
        recordSubagentRun(dir, { sessionID: "s", callID: "c", tool: "shell", args: { command: "ls" }, output: "x" });
        expect(existsSync(join(dir, SUBAGENT_RUNS_FILE))).toBe(false);
    });

    it("records an unknown agent as unknown instead of dropping the call", () => {
        recordSubagentRun(dir, { sessionID: "s", callID: "c", tool: "subagent", args: {}, output: "" });
        expect(read()[0].agent).toBe("unknown");
    });

    it("never throws when the directory is unwritable", () => {
        expect(() => recordSubagentRun("/nonexistent/readonly/dir", { sessionID: "s", callID: "c", tool: "subagent", args: { agent: "x" }, output: "" })).not.toThrow();
    });
});
