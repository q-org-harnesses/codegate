import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const LINT = join(here, "..", "scripts", "skill-lint.mjs");
const LEDGER = join(here, "..", "scripts", "new-ledger.mjs");
const run = (script, args, opts = {}) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", ...opts });

const GOOD = `---
name: demo-skill
description: Convert widgets into gadgets. Use when the Owner asks to convert a widget.
license: MIT
compatibility: OpenCode 2
metadata:
  version: "0.1.0"
---
# demo-skill
## Steps
1. Run \`scripts/demo.mjs --help\`.
2. Run it on the widget.
3. Check the output with the test in tests/.
See references/spec.md.
`;

function mk(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "sk-"));
  const dir = join(root, overrides.dirName ?? "demo-skill");
  mkdirSync(join(dir, "scripts"), { recursive: true }); mkdirSync(join(dir, "references")); mkdirSync(join(dir, "tests")); mkdirSync(join(dir, "logs"));
  writeFileSync(join(dir, "SKILL.md"), overrides.skill ?? GOOD);
  writeFileSync(join(dir, "references", "spec.md"), "spec");
  writeFileSync(join(dir, "scripts", "demo.mjs"), overrides.script ?? 'if (process.argv.includes("--help")) { console.log("usage: demo"); process.exit(0); }\n');
  writeFileSync(join(dir, "tests", "demo.test.mjs"), "// test");
  writeFileSync(join(dir, "logs", "trial.md"), "trial ok");
  return dir;
}

test("a well-formed skill passes every check and counts them", () => {
  const r = run(LINT, [mk()]);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /skill-lint failures=0 checks=15/);
});

test("directory name must match the name field", () => {
  const r = run(LINT, [mk({ dirName: "other-name" })]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL L01-dir-matches-name/);
});

test("a description without a when-clause fails", () => {
  const r = run(LINT, [mk({ skill: GOOD.replace(/description:.*/, "description: Converts widgets into gadgets for later processing by the line.") })]);
  assert.match(r.stdout, /FAIL L03-description-says-when/);
});

test("command examples with $( are flagged", () => {
  const r = run(LINT, [mk({ skill: GOOD + "\n```\nnode x.mjs --probe $(curl localhost)\n```\n" })]);
  assert.match(r.stdout, /FAIL L07-no-shell-expansion-in-examples.*lines/);
});

test("a planted secret is caught", () => {
  const dir = mk();
  writeFileSync(join(dir, "references", "spec.md"), "key: nv" + "api-ABCDEFGHIJKLMNOPQRSTUV");
  const r = run(LINT, [dir]);
  assert.match(r.stdout, /FAIL L09-no-secrets.*spec\.md/);
});

test("a script that ignores --help fails; zero tests with scripts fails", () => {
  const dir = mk({ script: "console.log('');\nprocess.exit(1);\n" });
  const r = run(LINT, [dir]);
  assert.match(r.stdout, /FAIL L10-scripts-answer-help.*demo\.mjs/);
  const dir2 = mk();
  writeFileSync(join(dir2, "tests", "demo.test.mjs"), "");
  spawnSync("rm", ["-rf", join(dir2, "tests")]);
  assert.match(run(LINT, [dir2]).stdout, /FAIL L11-tests-exist/);
});

test("missing broken reference link and missing logs fail", () => {
  const dir = mk({ skill: GOOD + "\nAlso `references/nothere.md`.\n" });
  assert.match(run(LINT, [dir]).stdout, /FAIL L08-links-exist.*nothere/);
  spawnSync("rm", ["-rf", join(dir, "logs")]);
  assert.match(run(LINT, [dir]).stdout, /FAIL L12-trial-log/);
});

test("lint is read-only", () => {
  const dir = mk();
  const before = spawnSync("find", [dir, "-type", "f", "-newer", join(dir, "SKILL.md")], { encoding: "utf8" }).stdout;
  run(LINT, [dir]);
  const after = spawnSync("find", [dir, "-type", "f", "-newer", join(dir, "SKILL.md")], { encoding: "utf8" }).stdout;
  assert.equal(after, before);
});

test("new-ledger --kind skill renders a lint-clean ledger and refuses to overwrite", () => {
  const repo = mkdtempSync(join(tmpdir(), "repo-"));
  mkdirSync(join(repo, "skills", "demo-skill"), { recursive: true });
  const out = join(repo, "GATES.md");
  const args = ["--kind", "skill", "--task", "SK1", "--skill-dir", join(repo, "skills", "demo-skill"), "--repo", repo, "--tests", "node --test tests/", "--out", out];
  const r = run(LEDGER, args);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = readFileSync(out, "utf8");
  assert.equal((text.match(/^- \[ \] G\d/gm) || []).length, 8);
  assert.ok(!/\{\{/.test(text), "no unreplaced placeholder");
  assert.match(text, /skills\/demo-skill\//);
  const again = run(LEDGER, args);
  assert.equal(again.status, 3);
});

test("new-ledger --kind skill rejects a skill dir outside the config repo", () => {
  const r = run(LEDGER, ["--kind", "skill", "--task", "SK1", "--skill-dir", "/tmp/elsewhere/x", "--repo", "/tmp/repo-none", "--tests", "t"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /inside/);
});

test("code-mode ledger whose allow regex starts with an escaped dot still lints (OWNS is not read as absolute)", () => {
  const dir = mkdtempSync(join(tmpdir(), "led-"));
  const out = join(dir, "GATES.md");
  const r = run(LEDGER, ["--task", "T1", "--tests", "echo t", "--run-cmd", "echo r", "--run-expect", "r", "--allow", "\\.github/workflows/web\\.yml$|tests/ci/", "--out", out]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(readFileSync(out, "utf8"), /^OWNS: \.github\//m);
});
