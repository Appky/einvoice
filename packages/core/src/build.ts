/**
 * Invoice generation: a pragmatic input → valid EN 16931 UBL 2.1 XML.
 *
 * Design goals:
 * - The caller provides business facts (parties, lines, payment); the
 *   error-prone derived values — line extensions, VAT breakdown per
 *   category/rate, document totals — are computed here with exact decimal
 *   arithmetic, so BR-CO-10..17 and the VAT category groups hold by
 *   construction.
 * - Output is verified by our own engine in tests: build → parse → validate
 *   must produce zero findings for every supported scenario (round-trip
 *   property), including the XRechnung and Peppol packs when those profiles
 *   are selected.
 */

import { Dec } from "./decimal.js";

export interface BuildParty {
  /** Legal name (BT-27/BT-44). */
  name: string;
  /** VAT identifier with country prefix, e.g. "DE123456789" (BT-31/BT-48). */
  vatId?: string;
  /** Legal registration identifier, e.g. trade register number (BT-30/BT-47). */
  registrationId?: string;
  street?: string;
  city?: string;
  postCode?: string;
  /** ISO 3166-1 alpha-2 (BT-40/BT-55). Required. */
  countryCode: string;
  /** Electronic address for Peppol/XRechnung routing (BT-34/BT-49). */
  electronicAddress?: { scheme: string; value: string };
  /** Contact (BG-6) — required by XRechnung for the seller. */
  contact?: { name?: string; phone?: string; email?: string };
}

export interface BuildLine {
  /** Item name (BT-153). */
  name: string;
  description?: string;
  /** Invoiced quantity (BT-129), decimal string or number. */
  quantity: string | number;
  /** UN/ECE Rec 20/21 unit code (BT-130), e.g. C62, HUR, DAY, KGM. */
  unit: string;
  /** Item net price (BT-146), decimal string or number. */
  unitPrice: string | number;
  /** VAT category (BT-151): S, Z, E, AE, K, G, O, L, M. Default "S". */
  vatCategory?: string;
  /** VAT rate percent (BT-152), e.g. 19 or "19". Required unless category O. */
  vatRate?: string | number;
}

export interface InvoiceInput {
  /** Invoice number (BT-1). */
  number: string;
  /** Issue date YYYY-MM-DD (BT-2). */
  issueDate: string;
  /** Due date YYYY-MM-DD (BT-9). */
  dueDate?: string;
  /** 380 invoice (default) or 381 credit note (emitted as UBL CreditNote). */
  typeCode?: "380" | "381" | "384" | "389" | "326";
  /** ISO 4217 (BT-5). Default "EUR". */
  currency?: string;
  /** Buyer reference / Leitweg-ID (BT-10). Required for XRechnung. */
  buyerReference?: string;
  /** Purchase order reference (BT-13). */
  orderReference?: string;
  /** Target profile. Sets BT-24 (+BT-23 for Peppol) and which rule packs the
   * output must satisfy. Default "en16931". */
  profile?: "en16931" | "xrechnung" | "peppol";
  seller: BuildParty;
  buyer: BuildParty;
  lines: BuildLine[];
  /** IBAN for SEPA credit transfer (BT-84; emits payment means 58). */
  iban?: string;
  /** BIC (BT-86), optional. */
  bic?: string;
  /** Payment terms free text (BT-20). */
  paymentTerms?: string;
  /** Invoice note (BT-22). */
  note?: string;
  /** Exemption reason text (BT-120) — required when a line uses category
   * E/AE/K/G/O. A sensible default is filled per category if omitted. */
  exemptionReason?: string;
}

export class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildError";
  }
}

const SPEC_IDS = {
  en16931: "urn:cen.eu:en16931:2017",
  xrechnung: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
  peppol: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
} as const;

const DEFAULT_EXEMPTION: Record<string, { text: string; code?: string }> = {
  E: { text: "Exempt from VAT" },
  AE: { text: "Reverse charge", code: "VATEX-EU-AE" },
  K: { text: "Intra-Community supply", code: "VATEX-EU-IC" },
  G: { text: "Export outside the EU", code: "VATEX-EU-G" },
  O: { text: "Not subject to VAT", code: "VATEX-EU-O" },
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const d = (v: string | number, what: string): Dec => {
  const parsed = Dec.parse(String(v));
  if (!parsed) throw new BuildError(`${what}: "${v}" is not a decimal number`);
  return parsed;
};

interface ComputedLine {
  line: BuildLine;
  qty: Dec;
  price: Dec;
  net: Dec;
  category: string;
  rate: Dec | undefined;
}

/**
 * Build a valid EN 16931 invoice as UBL 2.1 XML.
 * Totals and the VAT breakdown are derived; the result round-trips through
 * `parseInvoice` + `validate` with zero findings for supported inputs.
 */
export function buildInvoice(input: InvoiceInput): string {
  const profile = input.profile ?? "en16931";
  const currency = input.currency ?? "EUR";
  const typeCode = input.typeCode ?? "380";
  const creditNote = typeCode === "381";

  if (!input.lines?.length) throw new BuildError("At least one line is required (BR-16).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) throw new BuildError("issueDate must be YYYY-MM-DD.");
  if (profile === "xrechnung") {
    if (!input.buyerReference) throw new BuildError("XRechnung requires buyerReference (BT-10, the Leitweg-ID for B2G) — BR-DE-15.");
    const sc = input.seller.contact;
    if (!sc?.name || !sc?.phone || !sc?.email) throw new BuildError("XRechnung requires seller contact name, phone and email (BR-DE-5/6/7).");
    if (!input.iban) throw new BuildError("XRechnung requires payment instructions (BR-DE-1) — provide an iban.");
    if (!input.seller.city || !input.seller.postCode || !input.buyer.city || !input.buyer.postCode) {
      throw new BuildError("XRechnung requires seller and buyer city and post code (BR-DE-3/4/8/9).");
    }
  }
  if (profile === "peppol") {
    if (!input.buyerReference && !input.orderReference) throw new BuildError("Peppol requires buyerReference or orderReference (PEPPOL-EN16931-R003).");
    if (!input.seller.electronicAddress || !input.buyer.electronicAddress) {
      throw new BuildError("Peppol requires seller and buyer electronic addresses (R010/R020), e.g. { scheme: \"9930\", value: \"DE123456789\" }.");
    }
  }

  // ——— cross-field guards derived from the rule engine ———
  const categories = new Set(input.lines.map((l) => l.vatCategory ?? "S"));
  if (categories.has("K")) {
    throw new BuildError("Category K (intra-Community supply) is not supported by the builder yet: BR-IC-11/12 require delivery evidence fields. Use category AE for reverse charge, or build the XML manually.");
  }
  const taxedCategories = ["S", "Z", "E", "AE", "G", "L", "M"].some((c) => categories.has(c));
  if (taxedCategories && !input.seller.vatId) {
    throw new BuildError("Seller vatId is required when lines use VAT categories S/Z/E/AE/G (BR-S-02, BR-E-02, BR-AE-02, BR-G-02).");
  }
  if (categories.has("AE") && !input.buyer.vatId && !input.buyer.registrationId) {
    throw new BuildError("Reverse charge (AE) requires the buyer's vatId or registrationId (BR-AE-02).");
  }
  if (categories.has("O")) {
    if (categories.size > 1) throw new BuildError('Category O ("not subject to VAT") cannot be mixed with other categories (BR-O-11).');
    if (input.seller.vatId || input.buyer.vatId) throw new BuildError("Category O invoices must not carry seller or buyer VAT identifiers (BR-O-02).");
    if (!input.seller.registrationId) throw new BuildError("Category O: provide seller registrationId so the seller stays identifiable (BR-CO-26).");
  }
  if (!input.seller.vatId && !input.seller.registrationId) {
    throw new BuildError("Seller needs vatId or registrationId (BR-CO-26).");
  }

  // ——— compute lines ———
  const computed: ComputedLine[] = input.lines.map((line, i) => {
    const qty = d(line.quantity, `line ${i + 1} quantity`);
    const price = d(line.unitPrice, `line ${i + 1} unitPrice`);
    if (price.isNegative()) throw new BuildError(`line ${i + 1}: unit price must not be negative (BR-27); model discounts as negative quantity or allowances.`);
    const category = line.vatCategory ?? "S";
    let rate: Dec | undefined;
    if (category === "O") {
      if (line.vatRate !== undefined) throw new BuildError(`line ${i + 1}: category O must not carry a VAT rate (BR-O-05).`);
    } else {
      if (line.vatRate === undefined) throw new BuildError(`line ${i + 1}: vatRate is required for category ${category}.`);
      rate = d(line.vatRate, `line ${i + 1} vatRate`);
      if (category === "S" && !rate.isPositive()) throw new BuildError(`line ${i + 1}: category S needs a rate > 0 (BR-S-05); use category Z for 0%.`);
      if (["Z", "E", "AE", "K", "G"].includes(category) && !rate.isZero()) throw new BuildError(`line ${i + 1}: category ${category} requires rate 0.`);
    }
    const net = qty.mul(price).round(2);
    return { line, qty, price, net, category, rate };
  });

  // ——— VAT breakdown by (category, rate) ———
  const groups = new Map<string, { category: string; rate: Dec | undefined; taxable: Dec }>();
  for (const cl of computed) {
    const key = `${cl.category}|${cl.rate?.toString() ?? ""}`;
    const g = groups.get(key) ?? { category: cl.category, rate: cl.rate, taxable: Dec.ZERO };
    g.taxable = g.taxable.add(cl.net);
    groups.set(key, g);
  }
  const breakdown = [...groups.values()].map((g) => {
    const taxable = g.taxable.round(2);
    const tax = g.rate ? taxable.mul(g.rate.divPercent()).round(2) : Dec.ZERO;
    return { ...g, taxable, tax };
  });

  const lineTotal = computed.reduce((s, cl) => s.add(cl.net), Dec.ZERO).round(2);
  const vatTotal = breakdown.reduce((s, b) => s.add(b.tax), Dec.ZERO).round(2);
  const taxInclusive = lineTotal.add(vatTotal).round(2);

  // ——— XML ———
  const rootTag = creditNote ? "CreditNote" : "Invoice";
  const rootNs = creditNote
    ? "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
    : "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
  const qtyTag = creditNote ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity";
  const lineTag = creditNote ? "cac:CreditNoteLine" : "cac:InvoiceLine";
  const typeTag = creditNote ? "cbc:CreditNoteTypeCode" : "cbc:InvoiceTypeCode";

  const party = (p: BuildParty, role: "seller" | "buyer"): string => {
    const lines: string[] = ["    <cac:Party>"];
    if (p.electronicAddress) {
      lines.push(`      <cbc:EndpointID schemeID="${esc(p.electronicAddress.scheme)}">${esc(p.electronicAddress.value)}</cbc:EndpointID>`);
    }
    lines.push("      <cac:PostalAddress>");
    if (p.street) lines.push(`        <cbc:StreetName>${esc(p.street)}</cbc:StreetName>`);
    if (p.city) lines.push(`        <cbc:CityName>${esc(p.city)}</cbc:CityName>`);
    if (p.postCode) lines.push(`        <cbc:PostalZone>${esc(p.postCode)}</cbc:PostalZone>`);
    lines.push(`        <cac:Country><cbc:IdentificationCode>${esc(p.countryCode)}</cbc:IdentificationCode></cac:Country>`);
    lines.push("      </cac:PostalAddress>");
    if (p.vatId) {
      lines.push("      <cac:PartyTaxScheme>");
      lines.push(`        <cbc:CompanyID>${esc(p.vatId)}</cbc:CompanyID>`);
      lines.push("        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>");
      lines.push("      </cac:PartyTaxScheme>");
    }
    lines.push("      <cac:PartyLegalEntity>");
    lines.push(`        <cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>`);
    if (p.registrationId) lines.push(`        <cbc:CompanyID>${esc(p.registrationId)}</cbc:CompanyID>`);
    lines.push("      </cac:PartyLegalEntity>");
    if (role === "seller" && p.contact && (p.contact.name || p.contact.phone || p.contact.email)) {
      lines.push("      <cac:Contact>");
      if (p.contact.name) lines.push(`        <cbc:Name>${esc(p.contact.name)}</cbc:Name>`);
      if (p.contact.phone) lines.push(`        <cbc:Telephone>${esc(p.contact.phone)}</cbc:Telephone>`);
      if (p.contact.email) lines.push(`        <cbc:ElectronicMail>${esc(p.contact.email)}</cbc:ElectronicMail>`);
      lines.push("      </cac:Contact>");
    }
    lines.push("    </cac:Party>");
    return lines.join("\n");
  };

  const x: string[] = [];
  x.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  x.push(`<${rootTag} xmlns="${rootNs}"`);
  x.push(`  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"`);
  x.push(`  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`);
  x.push(`  <cbc:CustomizationID>${SPEC_IDS[profile]}</cbc:CustomizationID>`);
  if (profile === "peppol") x.push(`  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>`);
  x.push(`  <cbc:ID>${esc(input.number)}</cbc:ID>`);
  x.push(`  <cbc:IssueDate>${input.issueDate}</cbc:IssueDate>`);
  if (input.dueDate && !creditNote) x.push(`  <cbc:DueDate>${esc(input.dueDate)}</cbc:DueDate>`);
  x.push(`  <${typeTag}>${typeCode === "381" ? "381" : typeCode}</${typeTag}>`);
  if (input.note) x.push(`  <cbc:Note>${esc(input.note)}</cbc:Note>`);
  x.push(`  <cbc:DocumentCurrencyCode>${esc(currency)}</cbc:DocumentCurrencyCode>`);
  if (input.buyerReference) x.push(`  <cbc:BuyerReference>${esc(input.buyerReference)}</cbc:BuyerReference>`);
  if (input.orderReference) x.push(`  <cac:OrderReference><cbc:ID>${esc(input.orderReference)}</cbc:ID></cac:OrderReference>`);
  x.push(`  <cac:AccountingSupplierParty>`);
  x.push(party(input.seller, "seller"));
  x.push(`  </cac:AccountingSupplierParty>`);
  x.push(`  <cac:AccountingCustomerParty>`);
  x.push(party(input.buyer, "buyer"));
  x.push(`  </cac:AccountingCustomerParty>`);
  if (input.iban) {
    x.push(`  <cac:PaymentMeans>`);
    x.push(`    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>`);
    x.push(`    <cbc:PaymentID>${esc(input.number)}</cbc:PaymentID>`);
    x.push(`    <cac:PayeeFinancialAccount>`);
    x.push(`      <cbc:ID>${esc(input.iban.replace(/\s+/g, ""))}</cbc:ID>`);
    if (input.bic) x.push(`      <cac:FinancialInstitutionBranch><cbc:ID>${esc(input.bic)}</cbc:ID></cac:FinancialInstitutionBranch>`);
    x.push(`    </cac:PayeeFinancialAccount>`);
    x.push(`  </cac:PaymentMeans>`);
  }
  if (input.paymentTerms) x.push(`  <cac:PaymentTerms><cbc:Note>${esc(input.paymentTerms)}</cbc:Note></cac:PaymentTerms>`);
  x.push(`  <cac:TaxTotal>`);
  x.push(`    <cbc:TaxAmount currencyID="${esc(currency)}">${vatTotal.toFixed2()}</cbc:TaxAmount>`);
  for (const b of breakdown) {
    x.push(`    <cac:TaxSubtotal>`);
    x.push(`      <cbc:TaxableAmount currencyID="${esc(currency)}">${b.taxable.toFixed2()}</cbc:TaxableAmount>`);
    x.push(`      <cbc:TaxAmount currencyID="${esc(currency)}">${b.tax.toFixed2()}</cbc:TaxAmount>`);
    x.push(`      <cac:TaxCategory>`);
    x.push(`        <cbc:ID>${esc(b.category)}</cbc:ID>`);
    if (b.rate) x.push(`        <cbc:Percent>${b.rate.toString()}</cbc:Percent>`);
    else if (profile === "xrechnung") x.push(`        <cbc:Percent>0</cbc:Percent>`); // BR-DE-14 wants BT-119 on every breakdown
    const needsReason = DEFAULT_EXEMPTION[b.category];
    if (needsReason) {
      const code = b.category !== "E" ? needsReason.code : undefined;
      if (code && profile !== "xrechnung") x.push(`        <cbc:TaxExemptionReasonCode>${code}</cbc:TaxExemptionReasonCode>`);
      x.push(`        <cbc:TaxExemptionReason>${esc(input.exemptionReason ?? needsReason.text)}</cbc:TaxExemptionReason>`);
    }
    x.push(`        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`);
    x.push(`      </cac:TaxCategory>`);
    x.push(`    </cac:TaxSubtotal>`);
  }
  x.push(`  </cac:TaxTotal>`);
  x.push(`  <cac:LegalMonetaryTotal>`);
  x.push(`    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${lineTotal.toFixed2()}</cbc:LineExtensionAmount>`);
  x.push(`    <cbc:TaxExclusiveAmount currencyID="${esc(currency)}">${lineTotal.toFixed2()}</cbc:TaxExclusiveAmount>`);
  x.push(`    <cbc:TaxInclusiveAmount currencyID="${esc(currency)}">${taxInclusive.toFixed2()}</cbc:TaxInclusiveAmount>`);
  x.push(`    <cbc:PayableAmount currencyID="${esc(currency)}">${taxInclusive.toFixed2()}</cbc:PayableAmount>`);
  x.push(`  </cac:LegalMonetaryTotal>`);
  computed.forEach((cl, i) => {
    x.push(`  <${lineTag}>`);
    x.push(`    <cbc:ID>${i + 1}</cbc:ID>`);
    x.push(`    <${qtyTag} unitCode="${esc(cl.line.unit)}">${cl.qty.toString()}</${qtyTag}>`);
    x.push(`    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${cl.net.toFixed2()}</cbc:LineExtensionAmount>`);
    x.push(`    <cac:Item>`);
    if (cl.line.description) x.push(`      <cbc:Description>${esc(cl.line.description)}</cbc:Description>`);
    x.push(`      <cbc:Name>${esc(cl.line.name)}</cbc:Name>`);
    x.push(`      <cac:ClassifiedTaxCategory>`);
    x.push(`        <cbc:ID>${esc(cl.category)}</cbc:ID>`);
    if (cl.rate) x.push(`        <cbc:Percent>${cl.rate.toString()}</cbc:Percent>`);
    x.push(`        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`);
    x.push(`      </cac:ClassifiedTaxCategory>`);
    x.push(`    </cac:Item>`);
    x.push(`    <cac:Price><cbc:PriceAmount currencyID="${esc(currency)}">${cl.price.toString()}</cbc:PriceAmount></cac:Price>`);
    x.push(`  </${lineTag}>`);
  });
  x.push(`</${rootTag}>`);
  return x.join("\n");
}
