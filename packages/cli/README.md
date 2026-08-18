# einvoice-cli

Command-line validator and viewer for EU e-invoices — EN 16931, XRechnung,
Factur-X/ZUGFeRD, UBL 2.1, CII, Peppol BIS. No Java, no uploads, zero dependencies.

```bash
npx einvoice-cli validate invoice.xml      # findings + exit 1 if invalid
npx einvoice-cli validate --json *.xml     # machine-readable, CI-friendly
npx einvoice-cli show facture.pdf          # human-readable Factur-X summary
npx einvoice-cli inspect invoice.xml       # EN 16931 semantic model as JSON
```

Full documentation: https://github.com/jurco321/einvoice
Browser version (nothing uploaded): https://jurco321.github.io/einvoice/
