# Changelog

## 0.2.0 — 2026-08-20

- **XRechnung rule pack (BR-DE)**: 31 national rules implemented natively —
  seller contact requirements, Leitweg-ID (BT-10), payment-means group
  consistency (BR-DE-23..25), IBAN checksum validation (ISO 13616), Skonto
  payment-terms format, unique attachment filenames and more. Applied
  automatically when BT-24 declares XRechnung; forceable via
  `validate(inv, { profile: "xrechnung" })`.
- All 81 valid files of the official KoSIT XRechnung test suite pass the pack
  with zero false positives; mutation tests cover activation and key rules.
- Official German rule texts included in the rules reference.

## 0.1.4 — 2026-08-20

- New: complete EN 16931 rules reference (223 rules, official text + practical
  fixes) at appky.github.io/einvoice/rules.html; findings in the playground and
  CLI link to it. Exposed as `ruleCatalog()` in the library API.
- New: parser hardening limits (25 MB input, depth 128, 500k elements) — the
  XML parser now bounds hostile input as well as excluding XXE.
- New: "See a failing invoice" demo, AGENTS.md, llms.txt, issue templates.

## 0.1.3 — 2026-08-20

- Project home is now the Appky organization: github.com/Appky/einvoice,
  site at appky.github.io/einvoice. Metadata and links updated; security
  reports now go through GitHub private vulnerability reporting.

## 0.1.2 — 2026-08-18

- Project moved to the whatwemake GitHub organization; repository, site and
  package metadata URLs updated (github.com/whatwemake/einvoice,
  whatwemake.github.io/einvoice).

## 0.1.1 — 2026-08-18

- Package naming settled after npm registry conflicts: the library publishes as
  **einvoice-kit** (npm blocks `einvoice` as too similar to `e-invoice`), the
  CLI now ships **inside** the library package (`npx einvoice-kit validate …` —
  the previously planned `einvoice-cli` name is owned by an unrelated tool), and
  the MCP server publishes as **einvoice-kit-mcp**.

## 0.1.0 — 2026-08-18

Initial release.

- EN 16931 semantic model (typed, BT/BG-documented) with UBL 2.1 Invoice &
  CreditNote and UN/CEFACT CII (D16B) mappers
- Native rule engine: ~165 rules — BR core, BR-CO calculations (official
  rounding and ±1 tolerances), BR-DEC lexical decimal rules, all ten VAT
  category groups, BR-CL code lists extracted from the official artefacts
- Factur-X / ZUGFeRD embedded-XML extraction from PDF (incl. PDF 2.0 / PDF/A-4,
  FlateDecode) without a PDF library
- Zero-dependency namespace-aware XML parser, XXE-immune by construction
- Exact BigInt fixed-point decimal arithmetic
- Text and standalone-HTML renderers
- `einvoice-kit`: validate / show / inspect with JSON output and CI exit codes
- `einvoice-kit-mcp`: MCP server exposing validate_invoice and read_invoice
- Conformance: 120 official corpus files (ConnectingEurope + KoSIT), every
  non-passing file annotated; corpus re-run weekly in CI
