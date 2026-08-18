# Changelog

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
- `einvoice-cli`: validate / show / inspect with JSON output and CI exit codes
- `einvoice-mcp`: MCP server exposing validate_invoice and read_invoice
- Conformance: 120 official corpus files (ConnectingEurope + KoSIT), every
  non-passing file annotated; corpus re-run weekly in CI
