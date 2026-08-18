# Maintenance runbook

The standard evolves slowly; the project is designed so every recurring task is
mechanical. This file is the operating manual — for the maintainer, and for the
agent sessions that do the recurring work.

## Recurring (CI does most of it)

**Weekly, automatic.** The CI cron re-clones the official corpora and fails if:
- the official code lists changed (`gen-codelists` diff check), or
- any corpus file's verdict changed unexpectedly (conformance floor step).

When the weekly run goes red:
1. `npm run gen:codelists -- <codes.sch> <model.sch>` against the fresh clone,
   review the diff (new currencies/EAS/VATEX codes are routine annual updates),
   commit.
2. If verdicts changed: inspect with `node scripts/corpus.mjs <file> -v`,
   update rule implementations or the known-failures list in `ci.yml` and the
   annotations in `scripts/build-site.mjs` — every known failure must keep a
   written justification.

## Releasing

```bash
npm version patch -w packages/core -w packages/cli -w packages/mcp
npm run build && npm test
npm publish -w packages/core && npm publish -w packages/cli -w packages/mcp
git push --follow-tags
```

Site deploys automatically from main.

## Issue triage guide

- **"File X validates in tool Y but not here"** — first reproduce, then check the
  rule against the official Schematron expression (corpus-cache/…/schematron).
  Our verdict should match the official artefacts, not other tools.
- **"Rule N is wrong"** — the official text is embedded next to each
  implementation in `rules-*.ts`; compare, fix, add a mutation test.
- **New format requests (KSeF FA, FatturaPA, UBL-SI…)** — track demand in issues;
  a format earns implementation when ≥3 independent requests exist.

## Roadmap order (see README)

XRechnung BR-DE rules → Peppol rules → generation (model → XML) → localized UI
(DE/SK/FR) → XSD option. BR-DE is first because Germany has the largest affected
population and XRechnung profile detection already exists.

## Invariants to never break

1. Zero runtime dependencies in all published packages.
2. Every rule carries the official rule id + text; hints are additive.
3. The corpus conformance page must be regenerated with every site deploy and
   every failure must be annotated.
4. Nothing a user drops into the site ever leaves their browser.
