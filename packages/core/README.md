# einvoice

**The EU e-invoicing toolkit for JavaScript/TypeScript.** Parse, validate and render
EN 16931 electronic invoices — **XRechnung, Factur-X/ZUGFeRD, UBL 2.1, UN/CEFACT CII,
Peppol BIS** — with zero dependencies, in Node ≥ 18, browsers and edge runtimes.

**Try it in your browser (nothing is uploaded): https://appky.github.io/einvoice/**

[![CI](https://github.com/Appky/einvoice/actions/workflows/ci.yml/badge.svg)](https://github.com/Appky/einvoice/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/einvoice-kit)](https://www.npmjs.com/package/einvoice-kit)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Why

Between 2025 and 2028 structured e-invoicing becomes mandatory across Europe
(Germany receives since 2025, Belgium 1/2026, Poland 2/2026, France 9/2026,
Slovakia 1/2027, ViDA EU-wide by 2030). Every invoicing SaaS, ERP integration and
accounting tool has to produce or consume EN 16931 documents.

The reference implementations are Java (Mustangproject, KoSIT) and Python
(factur-x). The npm ecosystem had generators, but no serious **native validator**:
JS developers shell out to Java or POST sensitive invoices to third-party APIs.

`einvoice` implements the EN 16931 semantic model and its business rules natively:

- **~165 rules**: mandatory fields (BR-\*), totals arithmetic (BR-CO-\*), decimal
  precision (BR-DEC-\*), all ten VAT category groups (S/Z/E/AE/K/G/O/L/M/B), and the
  code list rules (BR-CL-\*) with code sets extracted mechanically from the official
  validation artefacts.
- **Official semantics**: rounding, ±1 tolerances and absent-term handling mirror the
  official Schematron expressions — verified against **120 official test files** from
  the EU and KoSIT corpora in CI ([conformance report](https://appky.github.io/einvoice/conformance.html)).
- **Exact arithmetic**: BigInt fixed-point decimals; no IEEE-754 VAT surprises.
- **One semantic model**: UBL and CII map to the same typed model (every field
  documented with its BT/BG number), so rules are written once and findings are
  syntax-independent.
- **Security by construction**: the built-in XML parser does no entity expansion, no
  DOCTYPE, no external access — immune to XXE and billion-laughs. PDF extraction
  reads Factur-X/ZUGFeRD attachments (incl. PDF 2.0/A-4) without a PDF library.
- **Zero dependencies.** ~110 kB minified, runs in a browser tab.

## Install

```bash
npm install einvoice-kit        # library
# the CLI ships inside the package: npx einvoice-kit validate invoice.xml
```

## Library

```ts
import { parseInvoice, validate, renderText } from "einvoice-kit";

// Accepts UBL XML, CII XML, or Factur-X/ZUGFeRD PDF bytes — auto-detected
const { invoice, format, profile } = await parseInvoice(bytes);

const result = validate(invoice);
if (!result.ok) {
  for (const f of result.findings) {
    console.log(f.rule, f.where ?? "", f.hint ?? f.text);
    // BR-CO-15  BT-112 is 336.90, expected 366.86 (= 314.86 + 52.00).
  }
}

invoice.number;                 // BT-1
invoice.totals.payable?.raw;    // BT-115, lexical form preserved
invoice.lines[0].vat?.rate;     // BT-152
console.log(renderText(invoice)); // human-readable summary (also renderHtml)
```

## CLI

```bash
einvoice-kit validate invoice.xml            # findings + exit code 1 if invalid
einvoice-kit validate --json *.xml           # machine-readable, CI-friendly
einvoice-kit show facture.pdf                # read a Factur-X PDF like a human
einvoice-kit inspect invoice.xml             # semantic model as JSON
```

## MCP server (AI agents)

```jsonc
// e.g. Claude Desktop / any MCP client
{ "mcpServers": { "einvoice": { "command": "npx", "args": ["-y", "einvoice-kit-mcp"] } } }
```

Tools `validate_invoice` and `read_invoice` accept XML content or a file path
(including Factur-X PDFs) and run entirely locally.

## What it is not (yet)

- No XSD schema validation (the semantic rules catch interoperability issues;
  schema validation is planned behind a flag).
- No national CIUS rule sets yet: XRechnung **BR-DE-\***, Peppol **PEPPOL-EN16931-R\***
  are the top roadmap items.
- No invoice **generation** yet (model → XML) — roadmap.
- Not legal or tax advice; findings are informational.

## Roadmap

1. XRechnung (BR-DE) and Peppol BIS rule packs, selected via the detected profile
2. Invoice generation: semantic model → valid UBL/CII (+ Factur-X embedding)
3. German/Slovak/French UI for the browser validator
4. XSD validation option, KSeF (PL) and UBL-SI mappings as demand shows

## Contributing & development

```bash
npm install
npm run build        # tsc for core/cli/mcp
npm test             # vitest unit + mutation tests
npm run corpus -- <dirs> --json corpus-report.json  # official corpora
npm run site         # build the static site into site-dist/
```

The corpus is fetched from the official repositories in CI (EUPL/Apache licensed);
nothing from them is redistributed here. Rule texts follow the published artefacts.
See [docs/MAINTENANCE.md](docs/MAINTENANCE.md) for how the project stays current.

## License

MIT © einvoice contributors. Maintained by [Appky](https://appky.sk).
