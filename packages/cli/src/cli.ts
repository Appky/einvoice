/**
 * einvoice CLI — validate and read EU e-invoices from the terminal.
 *
 *   einvoice validate invoice.xml [more...]   exit 1 if any file is invalid
 *   einvoice show invoice.pdf                 human-readable summary
 *   einvoice inspect invoice.xml              semantic model as JSON
 *
 * Flags: --json (machine output), --html (with show), --quiet, --no-color
 */

import { readFileSync } from "node:fs";
import process from "node:process";
import { parseInvoice, validate, renderText, renderHtml, VERSION, type Finding } from "einvoice-kit";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a: string) => a.startsWith("--")));
const positional = args.filter((a: string) => !a.startsWith("--"));
const cmd = positional[0];
const files = positional.slice(1);

const useColor = !flags.has("--no-color") && process.stdout.isTTY && process.env.NO_COLOR === undefined;
const red = (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);
const green = (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s);
const yellow = (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s);
const dim = (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s);

function usage(code: number): never {
  console.log(`einvoice ${VERSION} — EU e-invoice validator and viewer (EN 16931)

Usage:
  einvoice validate <file...>   Validate against the EN 16931 business rules
  einvoice show <file>          Human-readable invoice summary (--html for HTML)
  einvoice inspect <file>       Print the parsed semantic model as JSON

Options:
  --json       Machine-readable output
  --html       HTML output (with "show")
  --quiet      Only the verdict / findings
  --no-color   Disable colors

Supported inputs: UBL 2.1 Invoice & CreditNote, UN/CEFACT CII,
Factur-X / ZUGFeRD hybrid PDF, XRechnung (both syntaxes), Peppol BIS 3.0.
Everything runs locally; nothing is uploaded.`);
  process.exit(code);
}

if (!cmd || flags.has("--help") || flags.has("-h")) usage(cmd ? 0 : 1);
if (files.length === 0) usage(1);

const fmtFinding = (f: Finding): string => {
  const sev = f.severity === "fatal" ? red("error") : yellow("warn ");
  const where = f.where ? dim(` [${f.where}]`) : "";
  const hint = f.hint ? `\n         ${dim(f.hint)}` : "";
  return `  ${sev}  ${f.rule}${where}: ${f.text}${hint}`;
};

let exitCode = 0;
const jsonRows: unknown[] = [];

for (const file of files) {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(file));
  } catch (e) {
    console.error(red(`cannot read ${file}: ${(e as Error).message}`));
    exitCode = 2;
    continue;
  }
  try {
    const parsed = await parseInvoice(bytes);
    const { invoice, format, profile } = parsed;
    if (cmd === "validate") {
      const res = validate(invoice);
      if (flags.has("--json")) {
        jsonRows.push({ file, format, profile, ok: res.ok, errors: res.errors, warnings: res.warnings, findings: res.findings });
      } else {
        const head = `${res.ok ? green("VALID") : red("INVALID")}  ${file}  ${dim(`(${format}${profile.name ? `, ${profile.name}` : ""})`)}`;
        console.log(head);
        if (!flags.has("--quiet") || !res.ok) {
          for (const f of res.findings) console.log(fmtFinding(f));
        }
        if (res.findings.length === 0) console.log(dim(`  all ${res.rulesApplied}+ EN 16931 rules satisfied`));
      }
      if (!res.ok) exitCode = 1;
    } else if (cmd === "show") {
      console.log(flags.has("--html") ? renderHtml(invoice) : renderText(invoice));
    } else if (cmd === "inspect") {
      console.log(JSON.stringify({ file, format, profile, invoice }, null, 2));
    } else {
      usage(1);
    }
  } catch (e) {
    console.error(`${red("ERROR")}  ${file}: ${(e as Error).message}`);
    exitCode = 2;
  }
}

if (flags.has("--json") && cmd === "validate") {
  console.log(JSON.stringify(jsonRows.length === 1 ? jsonRows[0] : jsonRows, null, 2));
}
process.exit(exitCode);
