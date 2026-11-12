import { PATHS } from "../../shared/index.js";

export const WORKING_DISCIPLINE = `Read the relevant files and any mission context before changing anything, and preserve unrelated work. Use the project's real build/test commands and the installed tools; never invent APIs or claim checks you did not run. Use native OpenCode tools for exploration and edits and webfetch for external docs when available; if a capability is missing, say so and use a supported alternative.
Keep changes focused and synchronize affected tests, types, imports, configuration, and documentation. For behavior changes, demonstrate a failing regression test, fix it, and keep the test. Report what you observed, failed checks, and what remains.`;

// These files remain the completion authority until the mission-state migration ships.
export const MISSION_CONTRACT = `## Mission continuity and verification
Read ${PATHS.TODO}, ${PATHS.CONTEXT}, ${PATHS.STATUS}, and ${PATHS.SYNC_ISSUES} when present; missing or unreadable state is not completion. During an active mission keep the goal, next action, blockers, and evidence current in those files. Questions and standalone reviews need no mission files.
TODO schema:
## M1: Goal | status: in_progress
### T1.1: Deliverable | status: in_progress
- [ ] S1.1.1: Concrete action
Mark a leaf [x] only after tool-based verification and a parent status: completed only when every child is verified. Keep unfinished items and dependencies visible. Commander updates verified items directly; a delegated Reviewer updates only its assigned scope.
Before concluding a mission: every TODO item verified, ${PATHS.SYNC_ISSUES} resolved, every item in .opencode/verification-checklist.md (if present) passing, and the project's build and tests run with evidence. An empty file is not proof, and running delegated work is not done.
Respect user pause, abort, and changed instructions. When blocked, ask only when question permission allows it; otherwise report the blocker and keep the next action. Completion reports state outcome, evidence, and limitations.`;

export const DELEGATED_SCOPE = `Complete the assigned scope and report back to Commander. You are a terminal agent: never spawn subagents. Stay within your assigned files and tell Commander if the work needs more. Return changed files or findings, the verification commands you ran with their results, and unresolved issues.`;

/**
 * CodeGate: how a mission with acceptance gates runs. Commander proposes, the
 * Owner approves, the plugin verifies. Nothing here lets an agent declare itself done.
 */
export const GATE_PROTOCOL = `GATE PROTOCOL (CodeGate)
1. For an implementation mission, first have Planner write GATES.md in the project root using the codegate skill's template, one gate per outcome, each with a runnable CHECK and an EXPECT line that only success can print (no manual gates unless unavoidable). Then run the unlazy gate-lint and fix every warning.
2. Stop. Report "APPROVAL REQUIRED: GATES.md written, waiting for the Owner" and do no implementation. Never run --approve and never edit GATES.md after it exists: the Owner approves it, and any edit voids the approval.
3. Once the Owner confirms approval, implement (Worker), run Reviewer as a real subagent call on the diff, fix its findings, then run gate-check on the ledger. The plugin records subagent calls; a gate may check that record.
4. Writing the report and the STATUS line the gates require is mandatory, and committing them is part of the work.
5. You do not decide that the mission is complete. The plugin re-runs every gate and ends the mission only when all pass. If a gate cannot be met, say which and why; do not weaken it.`;
