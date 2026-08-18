#!/usr/bin/env node
/**
 * Conformance harness: run the validator across official EN 16931 example
 * corpora and print a per-file report plus summary statistics.
 *
 * Usage: node scripts/corpus.mjs <dir-or-file> [...more] [--json out.json] [-v]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseInvoice, validate } from "../packages/core/dist/index.js";

const args = process.argv.slice(2);
const verbose = args.includes("-v");
const jsonIdx = args.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;
const roots = args.filter((a, i) => !a.startsWith("-") && (jsonIdx < 0 || i !== jsonIdx + 1));

const files = [];
function walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) walk(join(p, e));
  } else if (/\.(xml|pdf)$/i.test(p)) {
    files.push(p);
  }
}
roots.forEach(walk);

const rows = [];
let parsed = 0;
let parseFailed = 0;
for (const f of files) {
  const bytes = new Uint8Array(readFileSync(f));
  try {
    const { invoice, format, profile } = await parseInvoice(bytes);
    const res = validate(invoice);
    parsed++;
    rows.push({
      file: f,
      format,
      profile: profile.name ?? profile.specificationId,
      ok: res.ok,
      errors: res.errors,
      warnings: res.warnings,
      rules: [...new Set(res.findings.map((x) => x.rule))],
      findings: res.findings,
    });
    const mark = res.ok ? "PASS" : "FAIL";
    console.log(`${mark}  ${basename(f)}  [${format}] errors=${res.errors} warnings=${res.warnings}${res.errors ? "  " + rows.at(-1).rules.join(",") : ""}`);
    if (verbose && !res.ok) {
      for (const fi of res.findings) console.log(`      ${fi.rule} ${fi.where ? `(${fi.where}) ` : ""}${fi.hint ?? fi.text}`);
    }
  } catch (e) {
    parseFailed++;
    rows.push({ file: f, parseError: String(e.message ?? e) });
    console.log(`ERR   ${basename(f)}  ${e.message}`);
  }
}

const valid = rows.filter((r) => r.ok).length;
console.log(`\n${files.length} files: ${parsed} parsed (${valid} pass validation), ${parseFailed} parse errors`);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ generated: null, rows }, null, 2));
  console.log("wrote", jsonOut);
}
