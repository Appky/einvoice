# Contributing

Bug reports with a failing invoice attached are the most valuable thing you can
send — real-world documents are how a validator earns trust. Strip anything
confidential first (names, IBANs, amounts can all be replaced; structure is what
matters).

## Ground rules

- **Verdicts follow the official artefacts.** If our result differs from the
  official EN 16931 Schematron (ConnectingEurope releases), that's a bug here.
  If another tool differs from the official artefacts, it isn't.
- Every rule implementation carries the official rule id and text next to the
  code; keep them in sync.
- Zero runtime dependencies is non-negotiable for published packages.
- New rules need a mutation test (an invoice that violates exactly that rule).

## Dev loop

```bash
npm install
npm run build && npm test
# conformance corpus (clones are gitignored):
git clone --depth 1 https://github.com/ConnectingEurope/eInvoicing-EN16931 corpus-cache/eInvoicing-EN16931
git clone --depth 1 https://github.com/itplr-kosit/xrechnung-testsuite corpus-cache/xrechnung-testsuite
node scripts/corpus.mjs corpus-cache/xrechnung-testsuite/src/test corpus-cache/eInvoicing-EN16931/ubl/examples corpus-cache/eInvoicing-EN16931/cii/examples
```

Good first contributions: XRechnung BR-DE rules, Peppol rule pack, translations
of rule hints (DE/SK/FR), real-world invoice samples for the test suite.
