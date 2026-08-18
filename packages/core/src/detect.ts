/** Format detection and the one-call parse entry point. */

import { XmlElement, parseXml } from "./xml.js";
import { Invoice } from "./model.js";
import { mapUbl, NS_UBL_INVOICE, NS_UBL_CREDITNOTE } from "./ubl.js";
import { mapCii, NS_CII } from "./cii.js";
import { extractEmbeddedXml, isPdf } from "./facturx.js";

export type SourceFormat = "ubl-invoice" | "ubl-creditnote" | "cii" | "facturx-pdf";

export interface ProfileInfo {
  /** Raw specification identifier (BT-24). */
  specificationId?: string;
  /** Friendly name of the recognized profile, if any. */
  name?: string;
}

export interface ParsedInvoice {
  invoice: Invoice;
  format: SourceFormat;
  profile: ProfileInfo;
  /** The XML root element, for callers that need raw access. */
  root: XmlElement;
}

const PROFILES: Array<[RegExp, string]> = [
  [/xrechnung/i, "XRechnung"],
  [/peppol.*billing/i, "Peppol BIS Billing 3.0"],
  [/factur-x\.eu:1p0:extended/i, "Factur-X Extended"],
  [/factur-x\.eu:1p0:en16931|zugferd.*:en16931|ferd:.*:comfort/i, "Factur-X / ZUGFeRD EN 16931"],
  [/factur-x\.eu:1p0:basicwl/i, "Factur-X Basic WL"],
  [/factur-x\.eu:1p0:basic|zugferd.*:basic/i, "Factur-X Basic"],
  [/factur-x\.eu:1p0:minimum|zugferd.*:minimum/i, "Factur-X Minimum"],
  [/urn:cen\.eu:en16931:2017$/i, "EN 16931 core"],
];

export function detectProfile(specificationId: string | undefined): ProfileInfo {
  if (!specificationId) return {};
  for (const [re, name] of PROFILES) {
    if (re.test(specificationId)) return { specificationId, name };
  }
  return { specificationId };
}

export class UnsupportedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

/** Parse invoice XML (UBL or CII) from a string or bytes. */
export function parseInvoiceXml(input: string | Uint8Array): ParsedInvoice {
  const root = parseXml(input);
  let invoice: Invoice;
  let format: SourceFormat;
  if (root.ns === NS_UBL_INVOICE && root.name === "Invoice") {
    invoice = mapUbl(root);
    format = "ubl-invoice";
  } else if (root.ns === NS_UBL_CREDITNOTE && root.name === "CreditNote") {
    invoice = mapUbl(root);
    format = "ubl-creditnote";
  } else if (root.ns === NS_CII && root.name === "CrossIndustryInvoice") {
    invoice = mapCii(root);
    format = "cii";
  } else {
    throw new UnsupportedFormatError(
      `Unrecognized document root <${root.name}> in namespace "${root.ns}". Supported: UBL 2.1 Invoice/CreditNote, UN/CEFACT CrossIndustryInvoice (CII), Factur-X/ZUGFeRD PDF.`,
    );
  }
  return { invoice, format, profile: detectProfile(invoice.specificationId), root };
}

/**
 * Parse any supported input: UBL XML, CII XML, or a Factur-X/ZUGFeRD PDF
 * with an embedded invoice.
 */
export async function parseInvoice(input: string | Uint8Array): Promise<ParsedInvoice> {
  if (typeof input !== "string" && isPdf(input)) {
    const candidates = await extractEmbeddedXml(input);
    for (const cand of candidates) {
      try {
        const parsed = parseInvoiceXml(cand.bytes);
        return { ...parsed, format: "facturx-pdf" };
      } catch {
        // try the next embedded file
      }
    }
    throw new UnsupportedFormatError(
      candidates.length === 0
        ? "This PDF contains no embedded XML invoice. A Factur-X/ZUGFeRD invoice must embed factur-x.xml / zugferd-invoice.xml."
        : "This PDF contains embedded files, but none parsed as a UBL or CII invoice.",
    );
  }
  return parseInvoiceXml(input);
}
