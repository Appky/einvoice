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
