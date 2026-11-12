# Gates: {{TASK}}

OWNS: {{OWNS}}

Scope: {{TASK}} as specified by the Owner. Gates rendered by the codegate skill on {{DATE}}; the Owner approves them before work starts.

- [ ] G1: Tests all pass (no failures)
  CHECK: bash -c '{{TESTS}} 2>&1 | tail -6'
  EXPECT: {{TESTS_EXPECT}}
  EVIDENCE: pending

- [ ] G2: A local run answers as the task requires
  CHECK: bash -c '{{RUN_CMD}}'
  EXPECT: {{RUN_EXPECT}}
  EVIDENCE: pending

- [ ] G3: The reviewer ran as a real subagent call (recorded by the plugin) and its raw output is saved
  CHECK: bash -c 'echo "ran=$(rg -c "\"agent\":\"(code-reviewer|Reviewer)\"" .codegate/subagent_runs.jsonl) words=$(wc -w < {{REVIEW_FILE}} | tr -d " ")"'
  EXPECT: /ran=[1-9]\d* words=([2-9]\d\d|\d{4,})/
  EVIDENCE: pending

- [ ] G4: The {{TASK}} STATUS line is added once since {{BASE}} and STATUS.md is committed
  CHECK: bash -c 'echo "added=$(git diff {{BASE}}..HEAD -- migration/STATUS.md | rg -c "^\+{{TASK_RE}} \| PASS \| {{DATE}} \|") dirty=$(git status --short migration/STATUS.md | wc -l | tr -d " ")"'
  EXPECT: added=1 dirty=0
  EVIDENCE: pending

- [ ] G5: The written report is in the branch commits since {{BASE}}
  CHECK: bash -c 'echo "in_commit=$(git diff --name-only {{BASE}}..HEAD | rg -c "^{{REPORT_RE}}$") words=$(git show HEAD:{{REPORT_FILE}} | wc -w | tr -d " ")"'
  EXPECT: /in_commit=1 words=([2-9]\d\d|\d{4,})/
  EVIDENCE: pending

- [ ] G6: The branch commits since {{BASE}} hold only allowed paths
  CHECK: bash -c 'git diff --name-only {{BASE}}..HEAD | rg -v "^({{ALLOW}})" | wc -l | tr -d " " | sed s/^/disallowed=/'
  EXPECT: disallowed=0
  EVIDENCE: pending
