#!/usr/bin/env node
// Render GATES.md from templates/gates-task.md and lint it. One command, no hand-copying.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(here, "..");
const log = (m) => { try { mkdirSync(join(skillDir, "logs"), { recursive: true }); appendFileSync(join(skillDir, "logs", "new-ledger.log"), `${new Date().toISOString()} ${m}\n`); } catch {} };
const help = `usage (skill): new-ledger.mjs --kind skill --task ID --skill-dir DIR --tests CMD [--repo DIR] [--skills-subdir DIR] [--tests-expect REGEX] [--done-cmd CMD --done-expect TEXT] [--status-re REGEX] [--date YYYY-MM-DD] [--out GATES.md]
  Renders templates/gates-skill.md: skill-lint, tests, trial log, reviewer ran, report and commit gates for building a skill (20i, 20i1).
usage: new-ledger.mjs --task ID --tests CMD --allow REGEX  (--run-cmd CMD --run-expect TEXT | --serve CMD --cwd DIR --port N --probes NAME=PATH=CODE,...)
  [--tests-expect REGEX] [--owns TEXT] [--base REF] [--review-file PATH] [--report-file PATH] [--date YYYY-MM-DD] [--out GATES.md] [--help]
Writes the ledger (refuses to overwrite) and runs gate-lint. Exit 0 = rendered and LINT OK; non-zero = stop and report.`;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) { console.log(help); process.exit(0); }
const a = {};
for (let i = 0; i < argv.length; i += 2) { if (!argv[i].startsWith("--") || argv[i + 1] === undefined) { console.error(`bad argument: ${argv[i]}\n${help}`); process.exit(2); } a[argv[i].slice(2)] = argv[i + 1]; }
function extra(a, repo) {
  let n = 9, out = "";
  const gate = (title, cmd, expect) => { out += `\n- [ ] G${n++}: ${title}\n  CHECK: bash -c '${cmd}'\n  EXPECT: ${expect}\n  EVIDENCE: pending\n`; };
  if (a["done-cmd"]) { if (!a["done-expect"] || /'/.test(a["done-cmd"])) { console.error("--done-cmd needs --done-expect and no single quotes"); process.exit(2); } gate("The task's done-check passes", a["done-cmd"], a["done-expect"]); }
  if (a["status-re"]) {
    gate("The STATUS line is in the HEAD commit", `git -C ${repo} show HEAD -- migration/STATUS.md | rg -c "^\\+${a["status-re"]}"`, "1");
    gate("STATUS.md has no uncommitted change", `echo "dirty=$(git -C ${repo} status --short migration/STATUS.md | wc -l | tr -d " ")"`, "dirty=0");
  }
  return out;
}
if (a.kind === "skill") {
  for (const k of ["task", "skill-dir", "tests"]) if (!a[k]) { console.error(`missing --${k}\n${help}`); process.exit(2); }
  if (/'/.test(a.tests)) { console.error("commands must not contain single quotes; use double quotes"); process.exit(2); }
  const targetDir = resolve(a["skill-dir"].replace(/^~\//, homedir() + "/"));
  const repo = resolve((a.repo ?? "~/.config/opencode").replace(/^~\//, homedir() + "/"));
  const sub = (a["skills-subdir"] ?? "skills").replace(/^\/|\/$/g, "");
  if (!targetDir.startsWith(`${repo}/${sub}/`)) { console.error(`--skill-dir must be inside ${repo}/${sub}/, got ${targetDir}`); process.exit(2); }
  const skillName = targetDir.slice(`${repo}/${sub}/`.length).split("/")[0];
  const base = `${sub}/${skillName}`;
  const reportRel = `${base}/references/build_report.md`;
  const re = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const vars = { TASK: a.task, DATE: a.date ?? new Date().toISOString().slice(0, 10), SKILL_NAME: skillName, SKILL_DIR: targetDir, REPO: repo, TESTS: a.tests,
    LINT: join(skillDir, "scripts", "skill-lint.mjs"), ALLOW: a["status-re"] ? `(${re(base + "/")}|migration/STATUS\\.md$)` : re(`${base}/`), BASE: base,
    TESTS_CHECK: a["tests-expect"] ? "tail -6" : "rg \"^. (pass|fail) \" | tr \"\\n\" \" \"", TESTS_EXPECT: a["tests-expect"] ?? "/pass [1-9]\\d* .{1,3} fail 0/", EXTRA: extra(a, repo), REPORT_REL: reportRel, REPORT_RE: re(reportRel) };
  const out = resolve(a.out ?? "GATES.md");
  if (existsSync(out)) { console.error(`${out} already exists: it is frozen. Ask the Owner to change it.`); log(`refused overwrite ${out}`); process.exit(3); }
  writeFileSync(out, readFileSync(join(skillDir, "templates", "gates-skill.md"), "utf8").replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`unknown placeholder ${k}`); return vars[k]; }));
  log(`rendered skill ledger ${out} for ${skillName}`);
  const unlazy0 = process.env.CODEGATE_UNLAZY_DIR ?? join(homedir(), ".config/opencode/skills/unlazy");
  try { console.log(execFileSync(process.execPath, [join(unlazy0, "scripts/gate-lint.mjs"), out], { encoding: "utf8" }).trim()); }
  catch (e) { console.error((e.stdout ?? "") + (e.stderr ?? "")); log("lint failed"); process.exit(1); }
  console.log(`GATES.md written: ${out}`);
  process.exit(0);
}
for (const k of ["task", "tests", "allow"]) if (!a[k]) { console.error(`missing --${k}\n${help}`); process.exit(2); }
// Server probe built here, so the agent's shell never expands $(...) or ${...} inside it.
if (a.probes) {
  for (const k of ["serve", "cwd", "port"]) if (!a[k]) { console.error(`--probes needs --${k}\n${help}`); process.exit(2); }
  if (!/^\d{2,5}$/.test(a.port)) { console.error("--port must be a number"); process.exit(2); }
  const probes = a.probes.split(",").map((s) => s.split("="));
  if (probes.some((p) => p.length !== 3 || !/^[a-z_]+$/.test(p[0]) || !/^\/\S*$/.test(p[1]) || !/^\d{3}$/.test(p[2]))) { console.error("--probes items look like name=/path=200"); process.exit(2); }
  const echo = probes.map(([n, path]) => `${n}=$(curl -s -o /dev/null -w %{http_code} localhost:${a.port}${path})`).join(" ");
  a["run-cmd"] = `cd ${a.cwd} && npm run build >/dev/null 2>&1 && (PORT=${a.port} ${a.serve} >/dev/null 2>&1 & sleep 3; echo "${echo}"; lsof -ti:${a.port} | xargs kill)`;
  a["run-expect"] = probes.map(([n, , code]) => `${n}=${code}`).join(" ");
}
for (const k of ["run-cmd", "run-expect"]) if (!a[k]) { console.error(`missing --${k} (or --probes)\n${help}`); process.exit(2); }
if (/'/.test(a["run-cmd"] + a.tests)) { console.error("commands must not contain single quotes (they sit inside bash -c '...'); use double quotes"); process.exit(2); }

const date = a.date ?? new Date().toISOString().slice(0, 10);
const reportFile = a["report-file"] ?? `docs/trial/${a.task}_report.md`;
const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const vars = {
  TASK: a.task, TASK_RE: re(a.task), DATE: date, OWNS: a.owns ?? a.allow.replace(/^\\/, ""),
  TESTS: a.tests, TESTS_EXPECT: a["tests-expect"] ?? "/Tests\\s+\\d+ passed \\(\\d+\\)/",
  RUN_CMD: a["run-cmd"], RUN_EXPECT: a["run-expect"],
  REVIEW_FILE: a["review-file"] ?? "docs/trial/code_review_raw.md",
  REPORT_FILE: reportFile, REPORT_RE: re(reportFile), ALLOW: a.allow, BASE: a.base ?? "migration",
};
const out = resolve(a.out ?? "GATES.md");
if (existsSync(out)) { console.error(`${out} already exists: it is frozen. Ask the Owner to change it.`); log(`refused overwrite ${out}`); process.exit(3); }
let text = readFileSync(join(skillDir, "templates", "gates-task.md"), "utf8");
text = text.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`unknown placeholder ${k}`); return vars[k]; });
writeFileSync(out, text);
log(`rendered ${out} for ${a.task}`);
const unlazy = process.env.CODEGATE_UNLAZY_DIR ?? join(homedir(), ".config/opencode/skills/unlazy");
try {
  const lint = execFileSync(process.execPath, [join(unlazy, "scripts/gate-lint.mjs"), out], { encoding: "utf8" });
  console.log(lint.trim());
} catch (e) { console.error((e.stdout ?? "") + (e.stderr ?? "")); log("lint failed"); process.exit(1); }
console.log(`GATES.md written: ${out}`);
