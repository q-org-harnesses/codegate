# codegate spec (v0.1.0)

Trust model: the Owner side approves the ledger (`gate-check --approve`); the plugin re-executes it (`--reverify`) and ends a mission only on ALL MET; agents cannot approve, cannot edit the ledger once written (GateGuard hook) and cannot write `.codegate/subagent_runs.jsonl`.

Known limits: GateGuard is a pattern check, not a sandbox (a determined agent can write files by other means); the real defences are approval binding (an edited command loses its approval) and re-execution by the plugin. Gate G3 proves a `code-reviewer` or `Reviewer` subagent call happened, not that its review was good. The template is written for repos like clmjournal (migration/STATUS.md, git); other repos need another template.

Lessons learned (2026-11-10 trials): agents tick manual gates with narrative evidence; scripts that print their own EXPECT text can never fail; a gate must read git or the plugin's own record, never the agent's word.
