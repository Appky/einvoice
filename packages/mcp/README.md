# einvoice-kit-mcp

MCP (Model Context Protocol) server that lets AI agents **read and validate EU
e-invoices locally**: EN 16931, XRechnung, Factur-X/ZUGFeRD, UBL, CII, Peppol BIS.

```jsonc
{ "mcpServers": { "einvoice": { "command": "npx", "args": ["-y", "einvoice-kit-mcp"] } } }
```

Tools:

- `validate_invoice` — EN 16931 business-rule validation (~165 rules) with
  plain-language findings. Accepts XML content or a file path (.xml or Factur-X .pdf).
- `read_invoice` — parses any supported invoice into a summary plus structured
  data (parties, lines, VAT breakdown, totals, payment details).

Invoice data never leaves the machine. Zero dependencies beyond the MIT-licensed
[einvoice](https://www.npmjs.com/package/einvoice-kit) engine, which is tested against
120 official EU/KoSIT corpus files.

Full documentation: https://github.com/whatwemake/einvoice
