# Security policy

## Report

Email juraj@appky.sk with details. You should get a response within 7 days.

## Design notes relevant to security review

- The XML parser performs no entity expansion beyond the five predefined
  entities and numeric references, rejects DOCTYPE entirely, and never touches
  the network or filesystem: XXE and entity-bomb classes are excluded by
  construction.
- PDF parsing reads embedded file streams only; no JavaScript in PDFs is ever
  evaluated.
- `renderHtml` escapes all document-derived strings; output contains no scripts.
- The published packages have zero runtime dependencies — the supply-chain
  surface is this repository.
- The website is static, makes no network requests with user data, sets no
  cookies, and loads no third-party resources.
