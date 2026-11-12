# CodeGate

A gate-enforced completion plugin for [OpenCode](https://opencode.ai) 2.

CodeGate refuses to end a mission until every acceptance gate in a `GATES.md` ledger really passes. The ledger is written before the work and approved by a human (the "Owner side"). The plugin then re-runs every approved gate command itself, so an agent's claim, a ticked box or an evidence line it wrote can never count as proof.

## Provided as is: no support

The code is published for anyone to read, use and fork under the MIT license. It is **not supported**: the Issues tab is turned off, and pull requests, questions and feature requests are not monitored. Fork it freely.

## Credit

- **CodeGate is a fork of [opencode-orchestrator](https://github.com/agnusdei1207/opencode-orchestrator) by agnusdei1207** (MIT), taken at upstream version 2.0.21 (commit `85fd256`). The mission loop, the four agent presets (Commander, Planner, Worker, Reviewer) and the `update_todo` tool are theirs. The upstream snapshot (author preserved) is this repository's first commit, minus upstream's `.github` folder (its CI publishes to npm and is not meant for a fork); the original README is in `README.upstream.md`.
- **Gate checking uses [unlazy](https://github.com/Leonxlnx/unlazy) by Leonxlnx** (MIT): `gate-check.mjs` and `gate-lint.mjs` run and verify the gates. CodeGate calls unlazy and never edits it.
- **The CodeGate changes were written by Claude Sonnet 5.5 (Anthropic)**, working with a human owner, and are in the second commit.

## What CodeGate adds to the upstream plugin

- `src/core/loop/gates.ts`: finds `GATES.md`, runs `gate-check --reverify` with `execFile` (no shell), and passes only on exit 0 and `ALL MET`. A missing checker, a timeout, an unapproved ledger or unexpected output all fail closed. Each gate gets a 600 s limit, and the total limit is 900 s.
- `src/core/loop/verification.ts` and the mission loop: when a ledger exists it decides completion; otherwise the upstream checkbox verifier applies. The loop pauses (and does not nag) while gates await approval.
- `src/hooks/custom/gate-guard.ts`: agents cannot run `--approve`, edit the approval store or rewrite a frozen ledger.
- A subagent-run recorder: every subagent start and finish is appended to `.codegate/subagent_runs.jsonl` (agent, session, call id, output hash), so a gate can prove a reviewer really ran.
- The `/task` template starts with `[no-start]`, so a harness that honours that marker skips its own session-start routine.
- `skill/codegate/`: an OpenCode skill with gate templates and a `new-ledger.mjs` script that renders a ledger in one command.

## Install

Needs Node.js 24 or later, OpenCode 2 and unlazy 2.x installed as an OpenCode skill (or set `CODEGATE_UNLAZY_DIR`).

```bash
git clone https://github.com/q-org-harnesses/codegate
cd codegate && npm ci && npm run build
```

Add the clone's path to the `plugins` list in your `opencode.json`. Install the skill by copying `skill/codegate` into `~/.config/opencode/skills/`.

## Use

1. Start a mission with `/task "..."`. The planner renders `GATES.md` from the skill and stops with `APPROVAL REQUIRED`.
2. A human reviews the gates and approves them: `node <unlazy>/scripts/gate-check.mjs --approve --timeout 600 GATES.md`. Approval is bound to the timeout.
3. The agent works. The mission ends only when the plugin's own `--reverify` prints `ALL MET`.

Gates prove process, not correctness: they check that tests ran, a reviewer ran, and the right files were committed. They do not judge whether the code is good.

## Tests

```bash
npm test                         # plugin: vitest
node --test skill/codegate/tests # skill
```

## License

MIT. The original copyright of agnusdei1207 is kept in `LICENSE`; the changes are published under the same license.
