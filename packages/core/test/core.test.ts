import { describe, expect, it } from "vitest";
import { Dec, lexicalFractionDigits } from "../src/decimal.js";
import { parseXml, XmlParseError } from "../src/xml.js";
import { parseInvoiceXml } from "../src/detect.js";
import { validate } from "../src/validate.js";
import { renderText, renderHtml } from "../src/render.js";

describe("Dec", () => {
  it("parses and prints exactly", () => {
    expect(Dec.parse("123.45")!.toString()).toBe("123.45");
    expect(Dec.parse("-0.10")!.toString()).toBe("-0.10");
    expect(Dec.parse("1e5")).toBeUndefined();
    expect(Dec.parse("")).toBeUndefined();
  });
  it("adds without float artefacts", () => {
    expect(Dec.parse("0.1")!.add(Dec.parse("0.2")!).toString()).toBe("0.3");
  });
  it("multiplies and rounds like XPath fn:round", () => {
    // 2.5 → 3, -2.5 → -2 (round half toward +∞)
    expect(Dec.parse("0.025")!.round(2).toString()).toBe("0.03");
    expect(Dec.parse("-0.025")!.round(2).toString()).toBe("-0.02");
    const vat = Dec.parse("183.23")!.mul(Dec.parse("6")!.divPercent()).round(2);
    expect(vat.toString()).toBe("10.99");
  });
  it("counts lexical fraction digits", () => {
    expect(lexicalFractionDigits("1.100")).toBe(3);
    expect(lexicalFractionDigits("1")).toBe(0);
  });
});

describe("XML parser", () => {
  it("resolves namespaces and entities", () => {
    const root = parseXml(`<a xmlns="urn:x" xmlns:b="urn:y"><b:c d="1 &amp; 2">T&#65;</b:c></a>`);
    expect(root.ns).toBe("urn:x");
    const c = root.get("urn:y", "c")!;
    expect(c.attr("d")).toBe("1 & 2");
    expect(c.text).toBe("TA");
  });
  it("rejects DOCTYPE (XXE immunity)", () => {
    expect(() => parseXml(`<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>`)).toThrow(XmlParseError);
  });
  it("rejects unknown entities", () => {
    expect(() => parseXml(`<a>&bogus;</a>`)).toThrow(/Unknown entity/);
  });
  it("handles CDATA and comments", () => {
    const root = parseXml(`<a><!-- c --><![CDATA[<not-xml>]]></a>`);
    expect(root.text).toBe("<not-xml>");
  });
});

const MINIMAL_UBL = (over: Partial<Record<string, string>> = {}) => `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ID>INV-1</cbc:ID>
  <cbc:IssueDate>2026-08-01</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PostalAddress><cbc:CityName>Bratislava</cbc:CityName><cac:Country><cbc:IdentificationCode>SK</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>SK2020000000</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Seller s.r.o.</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PostalAddress><cbc:CityName>Wien</cbc:CityName><cac:Country><cbc:IdentificationCode>AT</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer GmbH</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${over.vatTotal ?? "20.00"}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">100.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${over.catTax ?? "20.00"}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${over.cat ?? "S"}</cbc:ID><cbc:Percent>${over.rate ?? "20"}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${over.taxInclusive ?? "120.00"}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${over.payable ?? "120.00"}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${over.unit ?? "C62"}">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Widget</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>${over.cat ?? "S"}</cbc:ID><cbc:Percent>${over.rate ?? "20"}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${over.price ?? "100.00"}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

describe("validation of a well-formed minimal invoice", () => {
  it("passes all rules", () => {
    const { invoice, format, profile } = parseInvoiceXml(MINIMAL_UBL());
    expect(format).toBe("ubl-invoice");
    expect(profile.name).toBe("EN 16931 core");
    const res = validate(invoice);
    expect(res.findings).toEqual([]);
    expect(res.ok).toBe(true);
  });
});

describe("rule mutations are caught", () => {
  const failsWith = (xml: string, rule: string) => {
    const { invoice } = parseInvoiceXml(xml);
    const res = validate(invoice);
    expect(res.findings.map((f) => f.rule)).toContain(rule);
  };

  it("BR-CO-15: wrong grand total", () => failsWith(MINIMAL_UBL({ taxInclusive: "121.00", payable: "121.00" }), "BR-CO-15"));
  it("BR-CO-16: payable mismatch", () => failsWith(MINIMAL_UBL({ payable: "119.00" }), "BR-CO-16"));
  it("BR-CO-17: VAT amount off by more than 1", () => failsWith(MINIMAL_UBL({ catTax: "22.00", vatTotal: "22.00", taxInclusive: "122.00", payable: "122.00" }), "BR-CO-17"));
  it("BR-S-05: standard rate of zero", () => failsWith(MINIMAL_UBL({ rate: "0", catTax: "0.00", vatTotal: "0.00", taxInclusive: "100.00", payable: "100.00" }), "BR-S-05"));
  it("BR-E-10: exempt without reason", () => failsWith(MINIMAL_UBL({ cat: "E", rate: "0", catTax: "0.00", vatTotal: "0.00", taxInclusive: "100.00", payable: "100.00" }), "BR-E-10"));
  it("BR-27: negative price", () => failsWith(MINIMAL_UBL({ price: "-5.00" }), "BR-27"));
  it("BR-CL-23: bogus unit code", () => failsWith(MINIMAL_UBL({ unit: "BOGUS" }), "BR-CL-23"));
  it("BR-CL-04: bogus currency", () => {
    const xml = MINIMAL_UBL().replace(/EUR<\/cbc:DocumentCurrencyCode>/, "EUX</cbc:DocumentCurrencyCode>");
    failsWith(xml, "BR-CL-04");
  });
  it("BR-06: missing seller name", () => {
    const xml = MINIMAL_UBL().replace(/<cbc:RegistrationName>Seller s.r.o.<\/cbc:RegistrationName>/, "");
    failsWith(xml, "BR-06");
  });
});

describe("rendering", () => {
  it("renders text and HTML without leaking markup", () => {
    const { invoice } = parseInvoiceXml(MINIMAL_UBL());
    const text = renderText(invoice);
    expect(text).toContain("INV-1");
    expect(text).toContain("Widget");
    const html = renderHtml(invoice);
    expect(html).toContain("<article");
    expect(html).not.toContain("<script");
  });
  it("escapes hostile item names in HTML", () => {
    const xml = MINIMAL_UBL().replace("Widget", "&lt;img src=x onerror=alert(1)&gt;");
    const { invoice } = parseInvoiceXml(xml);
    expect(renderHtml(invoice)).not.toContain("<img");
  });
});

describe("parser hardening limits", () => {
  it("rejects excessive nesting depth", () => {
    const deep = "<a>".repeat(200) + "</a>".repeat(200);
    expect(() => parseXml(deep)).toThrow(/depth limit/);
  });
  it("accepts realistic nesting", () => {
    const ok = "<a>".repeat(50) + "</a>".repeat(50);
    expect(() => parseXml(ok)).not.toThrow();
  });
  it("rejects element-count bombs", () => {
    const wide = "<r>" + "<x/>".repeat(500_001) + "</r>";
    expect(() => parseXml(wide)).toThrow(/elements/);
  });
});

describe("XRechnung (BR-DE) pack", () => {
  const XR = (extra = "") =>
    MINIMAL_UBL().replace(
      "urn:cen.eu:en16931:2017",
      "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
    ) && MINIMAL_UBL().replace(
      "<cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>",
      `<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>${extra}`,
    );

  it("activates only for XRechnung profiles", () => {
    const plain = validate(parseInvoiceXml(MINIMAL_UBL()).invoice);
    expect(plain.findings.map((f) => f.rule).filter((r) => r.startsWith("BR-DE"))).toEqual([]);
    const xr = validate(parseInvoiceXml(XR()).invoice);
    const deRules = xr.findings.map((f) => f.rule).filter((r) => r.startsWith("BR-DE"));
    expect(deRules).toContain("BR-DE-1"); // no payment instructions
    expect(deRules).toContain("BR-DE-2"); // no seller contact
    expect(deRules).toContain("BR-DE-15"); // no buyer reference
  });

  it("can be forced via options", () => {
    const res = validate(parseInvoiceXml(MINIMAL_UBL()).invoice, { profile: "xrechnung" });
    expect(res.findings.map((f) => f.rule)).toContain("BR-DE-15");
  });

  it("validates IBANs per ISO 13616", async () => {
    const { isValidIban } = await import("../src/rules-xrechnung.js");
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("SK3112000000198742637541")).toBe(true);
    expect(isValidIban("DE89370400440532013001")).toBe(false);
    expect(isValidIban("NOT-AN-IBAN")).toBe(false);
  });
});

describe("Peppol BIS pack", () => {
  const PEPPOL_SPEC = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
  const asPeppol = () =>
    MINIMAL_UBL().replace(
      "<cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>",
      `<cbc:CustomizationID>${PEPPOL_SPEC}</cbc:CustomizationID><cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>`,
    );

  it("activates only for Peppol profiles", () => {
    const plain = validate(parseInvoiceXml(MINIMAL_UBL()).invoice);
    expect(plain.findings.some((f) => f.rule.startsWith("PEPPOL"))).toBe(false);
    const res = validate(parseInvoiceXml(asPeppol()).invoice);
    const rules = res.findings.map((f) => f.rule);
    expect(rules).toContain("PEPPOL-EN16931-R003"); // no buyer/order reference
    expect(rules).toContain("PEPPOL-EN16931-R010"); // no buyer endpoint
    expect(rules).toContain("PEPPOL-EN16931-R020"); // no seller endpoint
    expect(rules).not.toContain("PEPPOL-EN16931-R001"); // profile id present
  });

  it("R120: catches wrong line net vs qty × price", () => {
    const xml = asPeppol().replace(
      '<cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>',
      '<cbc:InvoicedQuantity unitCode="C62">2</cbc:InvoicedQuantity>',
    );
    const res = validate(parseInvoiceXml(xml).invoice);
    expect(res.findings.map((f) => f.rule)).toContain("PEPPOL-EN16931-R120");
  });
});

describe("buildInvoice round-trip", () => {
  const base = () => ({
    number: "RT-1",
    issueDate: "2026-10-01",
    dueDate: "2026-10-15",
    seller: {
      name: "Seller s.r.o.", vatId: "SK2021234567", registrationId: "12345678",
      street: "Hlavná 1", city: "Bratislava", postCode: "81101", countryCode: "SK",
      contact: { name: "Jan Novak", phone: "+421900123456", email: "jan@example.sk" },
      electronicAddress: { scheme: "9930", value: "SK2021234567" },
    },
    buyer: {
      name: "Buyer GmbH", vatId: "DE123456789",
      street: "Musterstr. 1", city: "Berlin", postCode: "10115", countryCode: "DE",
      electronicAddress: { scheme: "9930", value: "DE123456789" },
    },
    lines: [
      { name: "Development", quantity: 3, unit: "DAY", unitPrice: "400.00", vatRate: 23 },
      { name: "Consulting", quantity: "1.5", unit: "HUR", unitPrice: "80.00", vatRate: 23 },
    ],
    iban: "SK3112000000198742637541",
  });

  const roundTrip = async (input: any) => {
    const { buildInvoice } = await import("../src/build.js");
    const { parseInvoice } = await import("../src/detect.js");
    const xml = buildInvoice(input);
    const { invoice } = await parseInvoice(xml);
    return { xml, invoice, res: validate(invoice) };
  };

  it("EN 16931 core invoice validates clean", async () => {
    const { res, invoice } = await roundTrip(base());
    expect(res.findings).toEqual([]);
    expect(invoice.totals.payable?.raw).toBe("1623.60"); // (1200+120) × 1.23
  });

  it("XRechnung profile passes the BR-DE pack", async () => {
    const { res } = await roundTrip({ ...base(), profile: "xrechnung", buyerReference: "04011000-12345-67" });
    expect(res.findings).toEqual([]);
  });

  it("Peppol profile passes the Peppol pack", async () => {
    const { res } = await roundTrip({ ...base(), profile: "peppol", buyerReference: "PO-1" });
    expect(res.findings).toEqual([]);
  });

  it("credit note (381) validates clean", async () => {
    const { res, invoice } = await roundTrip({ ...base(), typeCode: "381" });
    expect(invoice.syntax).toBe("ubl-creditnote");
    expect(res.findings).toEqual([]);
  });

  it("reverse charge (AE) with default exemption reason", async () => {
    const input = base();
    input.lines = [{ name: "SaaS", quantity: 1, unit: "C62", unitPrice: "500.00", vatCategory: "AE", vatRate: 0 }];
    const { res, xml } = await roundTrip(input);
    expect(res.findings).toEqual([]);
    expect(xml).toContain("VATEX-EU-AE");
  });

  it("mixed rates produce one breakdown per rate", async () => {
    const input = base();
    input.lines.push({ name: "Books", quantity: 2, unit: "C62", unitPrice: "10.00", vatRate: 10 });
    const { invoice, res } = await roundTrip(input);
    expect(invoice.vatBreakdowns.length).toBe(2);
    expect(res.findings).toEqual([]);
  });

  it("category O end-to-end without VAT ids", async () => {
    const input: any = base();
    delete input.seller.vatId; delete input.buyer.vatId;
    input.lines = [{ name: "Public fee", quantity: 1, unit: "C62", unitPrice: "100.00", vatCategory: "O" }];
    const { res } = await roundTrip(input);
    expect(res.findings).toEqual([]);
  });

  it("rejects impossible inputs with named rules", async () => {
    const { buildInvoice, BuildError } = await import("../src/build.js");
    expect(() => buildInvoice({ ...base(), profile: "xrechnung" } as any)).toThrow(/BR-DE-15/);
    const s0 = base(); s0.lines[0]!.vatRate = 0 as any;
    expect(() => buildInvoice(s0 as any)).toThrow(/BR-S-05/);
  });
});
