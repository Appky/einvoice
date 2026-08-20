# Security policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: go to the repository's
**Security** tab → **Report a vulnerability**. Reports are reviewed by the
maintainers at [Appky](https://appky.sk); you should receive a response within
7 days. Please do not open public issues for security reports.

## Scope and design notes

- The XML parser performs no entity expansion beyond the five predefined
  entities and numeric references, rejects DOCTYPE entirely, and never touches
  the network or filesystem: XXE and entity-expansion attacks are excluded by
  construction.
- PDF parsing reads embedded file streams only; nothing inside a PDF is ever
  executed or evaluated.
- `renderHtml` escapes all document-derived strings; output contains no scripts.
- The published packages have zero runtime dependencies — the supply-chain
  surface is this repository.
- The website is static, makes no network requests with user data, sets no
  cookies, and loads no third-party resources.

Findings in any of these properties are considered vulnerabilities even without
a working exploit.
