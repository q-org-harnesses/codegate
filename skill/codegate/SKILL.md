---
name: codegate
description: Write acceptance gates for a coding task so the CodeGate plugin can refuse to end the mission until every gate really passes. Use at the start of any implementation mission (for example /task in OpenCode with the CodeGate plugin) for a repo such as clmjournal, before any code is written. Produces GATES.md from a template and lints it; the Owner approves it, the plugin verifies it.
license: MIT
compatibility: OpenCode 2 with the codegate plugin; Node 24 or later; unlazy 2.x installed at ~/.config/opencode/skills/unlazy.
metadata:
  version: "0.2.0"
  standard: "20i-skill_creation_standard"
---

# codegate

Gates are runnable checks written before the work. The plugin re-runs them and ends the mission only when all pass ([[21g-CodeGate_opencode_plugin]], spec in [references/codegate_spec.md](references/codegate_spec.md)).

## Requirements

- The CodeGate plugin is loaded (`opencode debug agents` lists `Commander`, `Planner`, `Worker`, `Reviewer`).
- You are the Planner, or the Commander acting for it. You never approve and never edit the ledger once it exists.

## Procedure

1. Pick the template: `templates/gates-task.md` (a clmjournal-style task with tests, a local run, a reviewer, a STATUS line and a report).
2. Render it in one command (do not hand-copy it, and never put `$(...)` or backticks in an argument: your shell would expand them before the script sees them). For a server task use the built-in probe:
   `node ~/.config/opencode/skills/codegate/scripts/new-ledger.mjs --task P6B.1 --tests "cd apps/server && npm test" --serve "npm start" --cwd apps/server --port 4790 --probes "root=/=200,health=/healthz=200,unknown=/unknown-xyz123.js=404" --allow "apps/server/(src/|tests/|package\.json$|tsconfig\.json$|vitest\.config\.ts$)|docs/trial/|migration/STATUS\.md$"`
   For a non-server task pass `--run-cmd` and `--run-expect` instead (plain commands without `$(...)`).
   It refuses to overwrite an existing `GATES.md`, fills the placeholders, writes `GATES.md` in the project root and runs `gate-lint`. Exit 0 means LINT OK.
3. Fix every lint warning by editing the arguments and re-rendering (delete the draft first). Add task-specific gates only as extra `- [ ] Gn:` blocks with a CHECK and an EXPECT only success can print.
4. Stop. Reply exactly `APPROVAL REQUIRED: GATES.md written, waiting for the Owner` and list the gate titles. Do no implementation.
5. After the Owner confirms approval: implement, run the Reviewer as a real subagent call, save its raw output to `docs/trial/code_review_raw.md` (or the path in gate G3), answer each finding in the report, write the STATUS line and the report, commit only the allowed paths, run `node ~/.config/opencode/skills/unlazy/scripts/gate-check.mjs GATES.md`.
6. Do not declare the mission complete. The plugin ends it when `gate-check --reverify` prints ALL MET.

## Mode B: building or changing a skill (20i, 20i1)

Use this instead of the code procedure above when the mission is a skill under `~/.config/opencode/skills/`.

1. Render the ledger in one command (the Owner side approves it before work starts):
   `node ~/.config/opencode/skills/codegate/scripts/new-ledger.mjs --kind skill --task SK1 --skill-dir ~/.config/opencode/skills/<name> --tests "node --test tests/"`
   It writes eight gates: `skill-lint` clean, the skill's own tests, a fresh-session trial log, a recorded reviewer run, the raw review, the build report in HEAD, only skill paths in HEAD, and no uncommitted change.
2. Stop with APPROVAL REQUIRED. Do not edit `GATES.md`. (Owner side: approve with `gate-check --approve --timeout 600 GATES.md`; an approval is bound to the timeout, and the plugin verifies with 600 s per gate.)
3. Build the skill with tests first. Run `node ~/.config/opencode/skills/codegate/scripts/skill-lint.mjs <skill dir>` often; it is read-only and prints PASS or FAIL per check.
4. Put the fresh-session trial in `logs/trial.md`, the raw reviewer output in `logs/code_review_raw.md` and the build report as build_report.md in the skill's references folder.
5. Commit only `skills/<name>/` in `~/.config/opencode`, then run `gate-check` on `GATES.md`.

`skill-lint` checks the mechanical rules only (names, frontmatter, length, numbered steps, no `$(` in examples, links, secrets, `--help`, tests, trial log). It cannot judge whether the skill is any good: the reviewer and the Owner's trial do that.

## Verification

- [ ] `GATES.md` exists, `gate-lint` printed LINT OK, and every gate has a CHECK and an EXPECT
- [ ] You did not run `--approve` and did not edit `GATES.md` after the first write
- [ ] Your reply names every gate and says approval is required

## Failure handling

If lint or rendering fails twice, stop and report the output. Do not write a ledger by hand to get around the script.
