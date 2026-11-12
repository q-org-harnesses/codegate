#!/usr/bin/env node
// skill-lint: deterministic checks of a skill folder against 20i (layers 1-3) and the mechanical rules of 20i1.
// Prints one PASS/FAIL line per check, then "skill-lint failures=N checks=M". Exit 0 only when failures=0.
// Read-only: it never writes inside the skill. Scripts are run only with --help, stdin closed, 10 s limit.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";

const help = `usage: skill-lint.mjs SKILL_DIR [--no-help-run]
Checks: name/dir match, name format, SKILL.md frontmatter, description (what + when, <= 1024), < 500 lines,
house fields (license, compatibility, metadata.version), numbered procedure, no \$(...) in command examples,
reference links exist, no secrets, every script answers --help, a test exists for scripts, trial log present.`;
const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) { console.log(help); process.exit(args.length ? 0 : 2); }
const dir = resolve(args.find((a) => !a.startsWith("--")));
const runHelp = !args.includes("--no-help-run");
const results = [];
const check = (id, ok, detail) => results.push({ id, ok: !!ok, detail });

if (!existsSync(dir) || !statSync(dir).isDirectory()) { console.error(`not a directory: ${dir}`); process.exit(2); }
const skillPath = join(dir, "SKILL.md");
const names = readdirSync(dir);
check("L02-skillmd-name", names.includes("SKILL.md"), names.includes("SKILL.md") ? "SKILL.md present" : `no SKILL.md (found: ${names.slice(0, 8).join(", ")})`);
if (!names.includes("SKILL.md")) done();

const src = readFileSync(skillPath, "utf8");
const lines = src.split("\n");
const fm = /^---\n([\s\S]*?)\n---\n/.exec(src);
check("L02-frontmatter", fm, fm ? "frontmatter block found" : "no YAML frontmatter at the top");
const meta = {};
if (fm) {
  let sub = null;
  for (const l of fm[1].split("\n")) {
    const top = /^([A-Za-z_-]+):\s*(.*)$/.exec(l);
    const nested = /^\s{2,}([A-Za-z_-]+):\s*(.*)$/.exec(l);
    if (top) { meta[top[1]] = top[2].replace(/^"|"$/g, ""); sub = top[1]; }
    else if (nested && sub) meta[`${sub}.${nested[1]}`] = nested[2].replace(/^"|"$/g, "");
  }
}
const name = meta.name ?? "";
check("L01-dir-matches-name", name && name === basename(dir), `dir=${basename(dir)} name=${name || "(none)"}`);
check("L01-name-format", /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length <= 64, `name="${name}" (lowercase letters, digits, single hyphens, <= 64)`);
const desc = meta.description ?? "";
check("L03-description-length", desc.length >= 40 && desc.length <= 1024, `${desc.length} characters (40..1024)`);
check("L03-description-says-when", /\b(use|when|before|after|if)\b/i.test(desc), "description must say WHEN to use the skill, not only what it is");
check("L04-under-500-lines", lines.length < 500, `${lines.length} lines`);
check("L05-house-fields", meta.license && meta.compatibility && /^\d+\.\d+\.\d+$/.test(meta["metadata.version"] ?? ""), `license=${!!meta.license} compatibility=${!!meta.compatibility} metadata.version=${meta["metadata.version"] ?? "(none)"}`);
const numbered = lines.filter((l) => /^\s*\d+\.\s+\S/.test(l)).length;
check("L06-numbered-procedure", numbered >= 3, `${numbered} numbered step lines (need >= 3)`);

// $(...) or backticks inside fenced command blocks: the agent's shell expands them before the script runs (21g lesson).
let inFence = false, bad = [];
lines.forEach((l, i) => { if (/^```/.test(l)) { inFence = !inFence; return; } if (inFence && /\$\(|`[^`]+`/.test(l)) bad.push(i + 1); });
check("L07-no-shell-expansion-in-examples", bad.length === 0, bad.length ? `command examples with $( or backticks at lines ${bad.slice(0, 6).join(", ")}` : "none");

// links to references/ scripts/ templates/ must exist.
const links = [...src.matchAll(/\]\((?!https?:)([^)#\s]+)\)|`((?:references|scripts|templates|assets)\/[^`\s]+)`/g)].map((m) => m[1] ?? m[2]);
const missing = [...new Set(links)].filter((p) => !existsSync(join(dir, p)));
check("L08-links-exist", missing.length === 0, missing.length ? `missing: ${missing.slice(0, 6).join(", ")}` : `${new Set(links).size} referenced path(s) all exist`);

// secrets in any text file
const files = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === ".git") continue; const p = join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } })(dir);
const secretRx = /(sk-or-v1-[a-f0-9]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|nvapi-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(password|passwd|api[_-]?key|secret)\s*[:=]\s*["'][^"']{8,}["'])/i;
const leaks = [];
for (const f of files) { if (statSync(f).size > 2e6) continue; let t; try { t = readFileSync(f, "utf8"); } catch { continue; } if (t.includes("\u0000")) continue; if (secretRx.test(t)) leaks.push(f.slice(dir.length + 1)); }
check("L09-no-secrets", leaks.length === 0, leaks.length ? `possible secret in: ${leaks.join(", ")}` : `${files.length} file(s) scanned`);

// scripts answer --help, no prompts
const scripts = existsSync(join(dir, "scripts")) ? readdirSync(join(dir, "scripts")).filter((f) => [".mjs", ".js", ".py", ".sh"].includes(extname(f))) : [];
if (scripts.length && runHelp) {
  const bin = { ".mjs": [process.execPath], ".js": [process.execPath], ".py": ["python3", "-I"], ".sh": ["bash"] };
  const notOk = [];
  for (const s of scripts) {
    const [cmd, ...pre] = bin[extname(s)];
    const r = spawnSync(cmd, [...pre, join(dir, "scripts", s), "--help"], { input: "", encoding: "utf8", timeout: 10000, cwd: "/tmp" });
    if (r.status !== 0 || !(r.stdout + r.stderr).trim()) notOk.push(`${s}(exit ${r.status})`);
  }
  check("L10-scripts-answer-help", notOk.length === 0, notOk.length ? `failed: ${notOk.join(", ")}` : `${scripts.length} script(s) answered --help with output`);
} else check("L10-scripts-answer-help", true, scripts.length ? "skipped (--no-help-run)" : "no scripts");

// 20i1 rule 17: a skill with scripts needs a real test file; zero is a failure, not a pass.
const testFiles = files.filter((f) => /(^|\/)(tests?|__tests__)\//.test(f.slice(dir.length)) || /\.test\.|test_/.test(basename(f)));
check("L11-tests-exist", !scripts.length || testFiles.length > 0, scripts.length ? `${testFiles.length} test file(s) for ${scripts.length} script(s)` : "no scripts, no tests needed");

// 20i: a test log from a fresh-session trial in logs/
const logsDir = join(dir, "logs");
const logFiles = existsSync(logsDir) ? readdirSync(logsDir).filter((f) => statSync(join(logsDir, f)).size > 0) : [];
check("L12-trial-log", logFiles.length > 0, logFiles.length ? `logs/: ${logFiles.slice(0, 4).join(", ")}` : "logs/ is missing or empty (no trial evidence)");

done();
function done() {
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
  const failures = results.filter((r) => !r.ok).length;
  console.log(`skill-lint failures=${failures} checks=${results.length}`);
  process.exit(failures ? 1 : 0);
}
