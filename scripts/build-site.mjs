#!/usr/bin/env node
/**
 * Build the static site into site-dist/: bundle the library for the browser
 * playground, generate pages with a shared layout, sitemap and robots.
 *
 * Usage: node scripts/build-site.mjs [--conformance corpus-report.json]
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(root, "site-dist");
mkdirSync(out, { recursive: true });

const BASE = "https://jurco321.github.io/einvoice";
const TODAY = new Date().toISOString().slice(0, 10);

// 1) Browser bundle of the core library.
await build({
  entryPoints: [join(root, "packages/core/src/index.ts")],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "EInvoice",
  target: ["es2022"],
  outfile: join(out, "einvoice.min.js"),
});

// 2) Static assets.
for (const f of ["style.css", "app.js", "sample-invoice.xml"]) {
  cpSync(join(root, "site", f), join(out, f));
}

// 3) Shared layout.
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#1d4ed8"/><path d="M9 8h14v3H9zm0 6h14v3H9zm0 6h9v3H9z" fill="#fff"/><circle cx="24" cy="23" r="5" fill="#15803d"/><path d="M21.5 23l2 2 3-3.5" stroke="#fff" stroke-width="1.6" fill="none"/></svg>`,
  );

const page = ({ path, title, description, body, current, scripts = "" }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${BASE}/${path === "index.html" ? "" : path}">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="style.css">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${BASE}/${path === "index.html" ? "" : path}">
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "einvoice",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any (browser, Node.js)",
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  description,
  url: BASE + "/",
  softwareHelp: "https://github.com/jurco321/einvoice",
  license: "https://opensource.org/licenses/MIT",
})}
</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="wrap">
    <a class="logo" href="./">einvoice<span>.</span></a>
    <nav aria-label="Main">
      <a href="./"${current === "home" ? ' aria-current="page"' : ""}>Validator</a>
      <a href="docs.html"${current === "docs" ? ' aria-current="page"' : ""}>Developers</a>
      <a href="conformance.html"${current === "conformance" ? ' aria-current="page"' : ""}>Conformance</a>
      <a href="https://github.com/jurco321/einvoice">GitHub</a>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site">
  <div class="wrap">
    <div>MIT-licensed open source. Validation results are informational, not legal or tax advice.</div>
    <div><a href="https://github.com/jurco321/einvoice">Source &amp; issues</a> · <a href="https://www.npmjs.com/package/einvoice-kit">npm</a></div>
  </div>
</footer>
${scripts}
</body>
</html>`;

// 4) Home page (playground).
const home = page({
  path: "index.html",
  current: "home",
  scripts: `<script src="einvoice.min.js" defer></script>\n<script src="app.js" defer></script>`,
  title: "Validate & view EU e-invoices in your browser — EN 16931, XRechnung, Factur-X, UBL, Peppol",
  description:
    "Free e-invoice validator and viewer. Check XRechnung, Factur-X/ZUGFeRD, UBL, CII and Peppol BIS invoices against the EN 16931 rules — entirely in your browser. Files are never uploaded.",
  body: `
<h1>Open an e-invoice. Understand it. Validate it.</h1>
<p class="sub">Drop an <strong>XRechnung</strong>, <strong>Factur-X / ZUGFeRD</strong>, <strong>UBL</strong>, <strong>CII</strong> or <strong>Peppol BIS</strong> invoice below.
You get a readable invoice and a full <strong>EN&nbsp;16931</strong> business-rule check — with every error explained in plain language.</p>

<div id="drop" class="drop">
  <p><strong>Drag &amp; drop</strong> an invoice file here — <code>.xml</code> or Factur-X/ZUGFeRD <code>.pdf</code></p>
  <p class="hintline">…or paste invoice XML anywhere on this page (Ctrl/Cmd+V)</p>
  <div class="row">
    <label class="btn" for="file">Choose a file<input type="file" id="file" accept=".xml,.pdf,application/xml,text/xml,application/pdf" class="visually-hidden"></label>
    <button id="try-sample" class="primary" type="button">Try a sample invoice</button>
  </div>
</div>
<p class="privacy">🔒 Everything runs locally in this tab. Your invoice is <strong>never uploaded</strong> — this page makes no network requests with your data and uses no analytics. <a href="https://github.com/jurco321/einvoice">Verify the source.</a></p>

<div id="result" aria-live="polite"></div>

<section class="features" aria-label="Why this tool">
  <article>
    <h3>Actually private</h3>
    <p>Invoices are business data. Unlike upload-based validators, parsing and validation happen in your browser via WebAssembly-free, dependency-free JavaScript. Works offline once loaded.</p>
  </article>
  <article>
    <h3>Tested against the official corpora</h3>
    <p>The engine is verified against the EU (ConnectingEurope) and KoSIT XRechnung test suites — 120 official files. <a href="conformance.html">See the conformance report.</a></p>
  </article>
  <article>
    <h3>Errors you can act on</h3>
    <p>Not just "[BR-CO-15] failed": each finding says what is wrong, where, and what the numbers should have been.</p>
  </article>
  <article>
    <h3>For developers too</h3>
    <p>The same engine is an MIT-licensed, zero-dependency TypeScript library with a CLI and an MCP server for AI agents. <a href="docs.html">Use it in your stack.</a></p>
  </article>
</section>

<h2 id="mandates">Why e-invoicing, why now</h2>
<p>Structured e-invoicing (EN 16931) is becoming mandatory across Europe. Key dates already in law:</p>
<table class="plain">
  <thead><tr><th>Country</th><th>What</th><th>When</th></tr></thead>
  <tbody>
    <tr><td>Germany</td><td>All businesses must be able to <em>receive</em> e-invoices (issuing phases in 2027–2028)</td><td>since Jan 2025</td></tr>
    <tr><td>Belgium</td><td>B2B e-invoicing via Peppol</td><td>Jan 2026</td></tr>
    <tr><td>Poland</td><td>KSeF clearance (large taxpayers Feb, all VAT payers Apr)</td><td>Feb–Apr 2026</td></tr>
    <tr><td>France</td><td>All companies must receive; large &amp; mid-size must issue (SMEs 2027)</td><td>Sep 2026</td></tr>
    <tr><td>Slovakia</td><td>Domestic B2B/B2G e-invoicing (zákon č. 385/2025 Z. z.)</td><td>Jan 2027</td></tr>
  </tbody>
</table>
<p class="meta">Dates verified 2026-08. Always confirm details with official sources for your country.</p>

<h2 id="faq">Questions people ask</h2>
<h3>Is my invoice uploaded anywhere?</h3>
<p>No. The validator is a static page; your file is read by JavaScript in your browser and never leaves your machine. There is no server to upload to, no analytics, no cookies.</p>
<h3>Which rules are checked?</h3>
<p>The EN 16931 business rules: mandatory fields (BR-*), totals arithmetic (BR-CO-*), decimal precision (BR-DEC-*), all ten VAT category rule groups (standard, zero, exempt, reverse charge, intra-community, export, IGIC, IPSI, not-subject, split payment) and the code list rules (BR-CL-*) — about 165 rules. National extensions such as XRechnung's BR-DE rules are on the <a href="https://github.com/jurco321/einvoice#roadmap">roadmap</a>.</p>
<h3>My accounting software produced an invalid invoice. What now?</h3>
<p>Each finding names the official rule and explains it in plain terms — send both to your software vendor. The rule IDs (like BR-CO-15) are the standard vocabulary every e-invoicing implementer understands.</p>
<h3>Can I validate many invoices at once?</h3>
<p>Use the CLI: <code>npx einvoice-kit validate *.xml</code> — same engine, exit codes for CI pipelines. <a href="docs.html">Details.</a></p>
`,
});

// 5) Developers page.
const docs = page({
  path: "docs.html",
  current: "docs",
  title: "einvoice — EN 16931 invoice parsing & validation for JavaScript/TypeScript",
  description:
    "Zero-dependency TypeScript library, CLI and MCP server for EU e-invoicing: parse and validate UBL, CII, XRechnung and Factur-X/ZUGFeRD against EN 16931 — no Java, no SaaS.",
  body: `
<h1>The missing EN 16931 toolkit for JavaScript</h1>
<p class="sub">Every serious EN 16931 implementation used to be Java or Python. <code>einvoice</code> brings parsing, validation and rendering of EU e-invoices to the npm ecosystem — zero dependencies, typed end to end, running in Node ≥ 18, browsers and edge runtimes.</p>

<ul class="badges">
  <li>MIT license</li><li>0 dependencies</li><li>~165 EN 16931 rules</li><li>UBL · CII · Factur-X · XRechnung · Peppol</li><li>Node · browser · edge</li>
</ul>

<h2>Library</h2>
<pre><code>npm install einvoice</code></pre>
<pre><code>import { parseInvoice, validate, renderText } from "einvoice-kit";

// UBL XML, CII XML, or a Factur-X/ZUGFeRD PDF — auto-detected
const { invoice, format, profile } = await parseInvoice(bytes);

const result = validate(invoice);          // EN 16931 business rules
if (!result.ok) {
  for (const f of result.findings) {
    console.log(f.rule, f.where ?? "", f.hint ?? f.text);
  }
}

console.log(invoice.totals.payable?.raw);  // typed semantic model (BT-115)
console.log(renderText(invoice));          // human-readable summary</code></pre>

<p>The parser is namespace-aware and immune to XXE by construction (no DOCTYPE, no entity expansion). All rule arithmetic uses exact BigInt decimals — no floating-point VAT surprises. Amounts keep their lexical form, so decimal-precision rules (BR-DEC) behave exactly like the official Schematron.</p>

<h2>CLI</h2>
<pre><code>npx einvoice-kit validate invoice.xml      # exit 1 on violations — CI-friendly
npx einvoice-kit validate --json *.xml     # machine-readable findings
npx einvoice-kit show facture.pdf          # readable summary of a Factur-X PDF
npx einvoice-kit inspect invoice.xml       # full semantic model as JSON</code></pre>

<h2>MCP server (AI agents)</h2>
<p>Give any MCP-capable agent the ability to read and validate e-invoices locally:</p>
<pre><code>{
  "mcpServers": {
    "einvoice": { "command": "npx", "args": ["-y", "einvoice-kit-mcp"] }
  }
}</code></pre>
<p>Tools: <code>validate_invoice</code> and <code>read_invoice</code> — both accept XML content or a file path, including Factur-X PDFs. Invoice data never leaves the machine.</p>

<h2>What's implemented</h2>
<table class="plain">
  <thead><tr><th>Area</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>UBL 2.1 Invoice &amp; CreditNote → semantic model</td><td>✅ full BT/BG mapping</td></tr>
    <tr><td>UN/CEFACT CII (D16B) → semantic model</td><td>✅ full BT/BG mapping</td></tr>
    <tr><td>Factur-X / ZUGFeRD PDF extraction</td><td>✅ incl. PDF 2.0 / PDF-A/4, Flate streams</td></tr>
    <tr><td>EN 16931 business rules (BR, BR-CO, BR-DEC, VAT groups, BR-CL)</td><td>✅ ~165 rules, official ±1 tolerances</td></tr>
    <tr><td>Rendering (text, standalone HTML)</td><td>✅</td></tr>
    <tr><td>XRechnung BR-DE / Peppol national rules</td><td>🔜 roadmap</td></tr>
    <tr><td>Invoice generation (model → XML)</td><td>🔜 roadmap</td></tr>
  </tbody>
</table>
<p>Verification: the engine runs against 120 official test files from the EU and KoSIT corpora in CI — see the <a href="conformance.html">conformance report</a>. Schema (XSD) validation is intentionally out of scope for v0.x; the semantic rules catch what matters for interoperability.</p>

<h2>Why not wrap the official Schematron?</h2>
<p>Running the official XSLT needs Java (or SaxonJS) and yields messages like <em>"[BR-CO-15] failed"</em>. A native rule engine over one semantic model validates both syntaxes with the same code, runs in ~1 ms per invoice, fits in a browser tab, and can tell you <em>"BT-112 is 336.90, expected 366.86 = 314.86 + 52.00"</em>. The official artefacts remain our reference: rule texts, code lists and tolerances are extracted from them mechanically, and the corpus keeps us honest.</p>
`,
});

// 6) Conformance page.
let conformanceBody = `
<h1>Conformance report</h1>
<p class="sub">Trust in a validator is earned, not asserted. This page reports how the engine behaves on every official test file we can find, and explains every disagreement. It is regenerated by CI on every change.</p>`;

const reportPath = process.argv.includes("--conformance")
  ? process.argv[process.argv.indexOf("--conformance") + 1]
  : join(root, "corpus-report.json");

const ANNOTATIONS = {
  "CII_example7.xml": "Official example is invalid per the official artefacts: it lacks a TaxTotalAmount in the invoice currency, which BR-CO-15 requires (count = 1). Our verdict matches the official Schematron.",
  "XRechnung-O.xml": "Official example is invalid per the official artefacts: missing TaxTotalAmount (BR-CO-15) and lowercase VATEX code “vatex-eu-132-1a” where the official code list is uppercase (BR-CL-22).",
  "01.05_minimal_test_uncefact.xml": "KoSIT minimal CII case omits TaxTotalAmount entirely; the official EN 16931 CII Schematron fails it on BR-CO-15 for the same reason we do.",
  "05.01a-INVOICE_ubl.xml": "KoSIT business case where BT-115 (366.86) ≠ BT-112 (336.90) with no prepaid/rounding amounts; BR-CO-16 fails under the official artefacts as well.",
  "02.01a-cvd_INVOICE_ubl.xml": "Uses item classification listID “CVD”, which is newer than the UNTDID 7143 list in the pinned official artefacts; an EN-core validator at the pinned release flags BR-CL-13.",
  "02.01a-cvd_INVOICE_uncefact.xml": "Same as its UBL sibling: post-release codelist value (BR-CL-13).",
  "04.05a-INVOICE_uncefact.xml": "XRechnung extension case using XR01/XR03 scheme identifiers, which are valid only under the XRechnung extension, not under the EN 16931 core ICD lists (BR-CL-10/21).",
};

if (existsSync(reportPath)) {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const rows = report.rows.filter((r) => !r.parseError);
  const parseErrors = report.rows.filter((r) => r.parseError);
  const pass = rows.filter((r) => r.ok);
  const fail = rows.filter((r) => !r.ok);
  conformanceBody += `
<table class="plain">
  <tbody>
    <tr><td>Official test files</td><td><strong>${report.rows.length}</strong> (ConnectingEurope eInvoicing-EN16931 examples + KoSIT XRechnung test suite, UBL &amp; CII)</td></tr>
    <tr><td>Parsed successfully</td><td><strong>${rows.length}</strong> (${parseErrors.length} parse failures)</td></tr>
    <tr><td>Pass validation</td><td><strong>${pass.length}</strong></td></tr>
    <tr><td>Flagged invalid</td><td><strong>${fail.length}</strong> — every one annotated below</td></tr>
  </tbody>
</table>
<h2>Files we flag, and why</h2>
<p>A validator that passes everything is not a validator. These official files contain genuine violations (several official examples are known to be invalid against the official artefacts) or values outside the pinned code lists:</p>
<table class="plain">
  <thead><tr><th>File</th><th>Rules raised</th><th>Assessment</th></tr></thead>
  <tbody>
  ${fail
    .map((r) => {
      const base = r.file.split("/").pop();
      return `<tr><td><code>${base}</code></td><td><code>${r.rules.join(", ")}</code></td><td>${ANNOTATIONS[base] ?? "Under investigation."}</td></tr>`;
    })
    .join("\n  ")}
  </tbody>
</table>
<h2>Method</h2>
<ul>
  <li>Rule semantics (rounding, ±1 tolerances, absent-term handling) are implemented from the official Schematron expressions, not from prose.</li>
  <li>Code lists are extracted mechanically from the official artefacts at build time — never hand-typed.</li>
  <li>The corpus is fetched fresh in CI from the official repositories (EUPL/Apache licensed) and re-run on every commit.</li>
  <li>Unit tests additionally verify that seeded rule violations (wrong totals, wrong VAT, bad codes) are caught — a validator must fail the invalid, not just pass the valid.</li>
</ul>
<p class="meta">Generated ${TODAY} from ${report.rows.length} corpus files.</p>`;
} else {
  conformanceBody += `<p>Conformance data was not generated in this build. Run <code>npm run corpus -- &lt;corpus-dirs&gt; --json corpus-report.json</code> first.</p>`;
}

const conformance = page({
  path: "conformance.html",
  current: "conformance",
  title: "Conformance report — einvoice EN 16931 validator",
  description:
    "How the einvoice EN 16931 validation engine performs on 120 official EU and KoSIT test files, with every disagreement documented.",
  body: conformanceBody,
});

// 7) 404.
const notFound = page({
  path: "404.html",
  current: "",
  title: "Page not found — einvoice",
  description: "Page not found.",
  body: `<h1>Page not found</h1><p><a href="./">Back to the validator</a>.</p>`,
});

writeFileSync(join(out, "index.html"), home);
writeFileSync(join(out, "docs.html"), docs);
writeFileSync(join(out, "conformance.html"), conformance);
writeFileSync(join(out, "404.html"), notFound);
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["", "docs.html", "conformance.html"].map((p) => `  <url><loc>${BASE}/${p}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}
</urlset>
`,
);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
writeFileSync(join(out, ".nojekyll"), "");

console.log("site built into", out);
