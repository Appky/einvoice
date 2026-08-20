/**
 * einvoice — EU e-invoicing toolkit for JavaScript/TypeScript.
 *
 * Parse UBL 2.1 / CII / Factur-X / XRechnung invoices into one typed
 * EN 16931 semantic model, validate them against the EN 16931 business
 * rules, and render them for humans. Zero dependencies; runs in Node ≥18,
 * browsers and edge runtimes.
 *
 * @example
 * ```ts
 * import { parseInvoice, validate, renderText } from "einvoice-kit";
 *
 * const { invoice, format, profile } = await parseInvoice(xmlOrPdfBytes);
 * const result = validate(invoice);
 * if (!result.ok) {
 *   for (const f of result.findings) console.log(`${f.rule}: ${f.hint ?? f.text}`);
 * }
 * console.log(renderText(invoice));
 * ```
 */

export { parseXml, XmlElement, XmlParseError, decodeXmlBytes } from "./xml.js";
export { Dec, lexicalFractionDigits } from "./decimal.js";
export * from "./model.js";
export { mapUbl, NS_UBL_INVOICE, NS_UBL_CREDITNOTE } from "./ubl.js";
export { mapCii, NS_CII } from "./cii.js";
export { isPdf, extractEmbeddedXml } from "./facturx.js";
export {
  parseInvoice,
  parseInvoiceXml,
  detectProfile,
  UnsupportedFormatError,
  type ParsedInvoice,
  type SourceFormat,
  type ProfileInfo,
} from "./detect.js";
export { validate, RULES_IMPLEMENTED } from "./validate.js";
export type { Finding, ValidationResult, Severity } from "./rules-util.js";
export { renderText, renderHtml } from "./render.js";

export const VERSION = "0.1.0";
export { ruleCatalog, type CatalogEntry } from "./rules-fixes.js";
export { RULE_TEXTS, type RuleInfo } from "./gen/rules-catalog.js";
export { XML_LIMITS } from "./xml.js";
export { isXRechnung, isValidIban, xrechnungRules } from "./rules-xrechnung.js";
export type { ValidateOptions } from "./validate.js";
export { isPeppol, peppolRules } from "./rules-peppol.js";
