# Gates: {{TASK}}

OWNS: {{ALLOW}}

Scope: build or change the skill {{SKILL_NAME}} as specified by the Owner (standards 20i and 20i1). Gates rendered by the codegate skill on {{DATE}}; the Owner approves them before work starts.

- [ ] G1: skill-lint passes every check
  CHECK: bash -c 'node {{LINT}} {{SKILL_DIR}} 2>&1 | tail -1'
  EXPECT: /failures=0 checks=(1[5-9]|[2-9]\d)/
  EVIDENCE: pending

- [ ] G2: The skill's own tests pass and at least one ran
  CHECK: bash -c 'cd {{SKILL_DIR}} && {{TESTS}} 2>&1 | {{TESTS_CHECK}}'
  EXPECT: {{TESTS_EXPECT}}
  EVIDENCE: pending

- [ ] G3: A fresh-session trial log exists and is non-trivial
  CHECK: bash -c 'wc -w < {{SKILL_DIR}}/logs/trial.md'
  EXPECT: /^\s*([1-9]\d\d|\d{4,})\s*$/
  EVIDENCE: pending

- [ ] G4: The reviewer ran as a real subagent call (recorded by the plugin, not by the agent)
  CHECK: bash -c 'rg -c "\"agent\":\"(code-reviewer|Reviewer)\"" .codegate/subagent_runs.jsonl'
  EXPECT: /^[1-9]/
  EVIDENCE: pending

- [ ] G5: Raw reviewer output saved and non-trivial
  CHECK: bash -c 'wc -w < {{SKILL_DIR}}/logs/code_review_raw.md'
  EXPECT: /^\s*([2-9]\d\d|\d{4,})\s*$/
  EVIDENCE: pending

- [ ] G6: The build report is in the HEAD commit
  CHECK: bash -c 'echo "in_commit=$(git -C {{REPO}} show --name-only --format= HEAD | rg -c "^{{REPORT_RE}}$") words=$(git -C {{REPO}} show HEAD:{{REPORT_REL}} | wc -w | tr -d " ")"'
  EXPECT: /in_commit=1 words=([2-9]\d\d|\d{4,})/
  EVIDENCE: pending

- [ ] G7: The HEAD commit holds only paths inside the skill
  CHECK: bash -c 'git -C {{REPO}} show --name-only --format= HEAD | rg -v "^{{ALLOW}}" | wc -l | tr -d " " | sed s/^/disallowed=/'
  EXPECT: disallowed=0
  EVIDENCE: pending

- [ ] G8: The skill folder has no uncommitted change
  CHECK: bash -c 'echo "dirty=$(git -C {{REPO}} status --short -- {{BASE}} | wc -l | tr -d " ")"'
  EXPECT: dirty=0
  EVIDENCE: pending
{{EXTRA}}