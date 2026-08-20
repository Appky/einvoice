/**
 * Curated, plain-language fix guidance for the EN 16931 rules people hit most
 * often in practice. Combined with the generated official texts by
 * `ruleCatalog()`. Contributions welcome — one sentence of honest, practical
 * advice per rule.
 */

import { RULE_TEXTS, RuleInfo } from "./gen/rules-catalog.js";

export interface CatalogEntry extends RuleInfo {
  id: string;
  /** Rule family, for grouping and navigation. */
  group: string;
  /** Practical guidance: what this failure usually means and how to fix it. */
  fix?: string;
}

const FIXES: Record<string, string> = {
  "BR-01": "Set the specification identifier (UBL: CustomizationID, CII: GuidelineSpecifiedDocumentContextParameter). For plain EN 16931 use \"urn:cen.eu:en16931:2017\"; XRechnung and Peppol have their own values.",
  "BR-02": "Every invoice needs an invoice number (BT-1). Check the field mapping in your invoicing software — this is almost always a mapping bug, not a business problem.",
  "BR-03": "Add the issue date (BT-2). UBL expects YYYY-MM-DD; CII uses DateTimeString with format=\"102\" and YYYYMMDD.",
  "BR-04": "Add an invoice type code (BT-3). Commercial invoice = 380, credit note = 381, corrected invoice = 384, self-billed = 389.",
  "BR-05": "Add the invoice currency (BT-5) as an ISO 4217 code such as EUR.",
  "BR-06": "The seller's legal name is missing. In UBL it lives in PartyLegalEntity/RegistrationName — PartyName alone is the trading name (BT-28), not the legal name (BT-27).",
  "BR-07": "The buyer's legal name is missing. Same trap as the seller: UBL wants PartyLegalEntity/RegistrationName.",
  "BR-08": "Add a seller postal address group — at minimum the country code.",
  "BR-09": "The seller address needs a country code (BT-40), two letters per ISO 3166-1 (DE, FR, SK…).",
  "BR-10": "Add a buyer postal address group — at minimum the country code.",
  "BR-11": "The buyer address needs a country code (BT-55).",
  "BR-12": "Add the sum of line net amounts (BT-106; UBL LineExtensionAmount in LegalMonetaryTotal, CII LineTotalAmount).",
  "BR-13": "Add the invoice total without VAT (BT-109).",
  "BR-14": "Add the invoice total with VAT (BT-112).",
  "BR-15": "Add the amount due for payment (BT-115).",
  "BR-16": "An invoice must have at least one line. If you are sending a document without lines, it is not an EN 16931 invoice.",
  "BR-21": "Every line needs its own identifier (BT-126) — a simple counter (1, 2, 3…) is fine.",
  "BR-22": "Every line needs an invoiced quantity (BT-129).",
  "BR-23": "Every line quantity needs a unit code (BT-130) from UN/ECE Recommendation 20/21. When in doubt use C62 (\"one\") for pieces, HUR for hours, DAY for days, KGM for kilograms.",
  "BR-25": "Every line needs an item name (BT-153).",
  "BR-26": "Every line needs an item net price (BT-146).",
  "BR-27": "Unit prices must not be negative. Model discounts as allowances (line or document level) or use a negative quantity for returns — not a negative price.",
  "BR-CO-09": "VAT identifiers must start with the two-letter country prefix (DE123456789, SK2021234567). Greece uses EL, Northern Ireland XI. A common failure is storing the national tax number without the prefix.",
  "BR-CO-10": "BT-106 must equal the sum of all line net amounts, rounded to 2 decimals. Recompute the sum instead of copying a value from elsewhere.",
  "BR-CO-13": "Total without VAT (BT-109) must equal line sum − document allowances + document charges. If you have no document-level allowances/charges, BT-109 must equal BT-106 exactly.",
  "BR-CO-14": "Total VAT (BT-110) must equal the sum of the per-category VAT amounts in the breakdown. Check that every VAT breakdown row is included in the total.",
  "BR-CO-15": "Total with VAT (BT-112) must equal BT-109 + BT-110, and the VAT total must exist in the invoice currency. The most common cause is rounding each line's VAT instead of computing VAT per category from the taxable base.",
  "BR-CO-16": "Amount due (BT-115) must equal BT-112 − paid (BT-113) + rounding (BT-114). If nothing was prepaid, BT-115 must equal BT-112 exactly.",
  "BR-CO-17": "Each VAT breakdown's tax amount must equal taxable × rate (±1 unit tolerance for accumulated rounding). Compute VAT per category, not per line.",
  "BR-CO-18": "Add a VAT breakdown (BG-23): at least one row with taxable amount, tax amount, category code and rate — even for 0% or exempt invoices.",
  "BR-CO-26": "The seller needs at least one machine-readable identifier: a seller ID (BT-29), legal registration ID (BT-30), or VAT ID (BT-31).",
  "BR-S-05": "Category S (standard rate) requires a rate greater than zero. For genuinely zero-rated supplies use category Z; for exempt supplies use E.",
  "BR-S-08": "For each rate under category S, the breakdown's taxable amount must equal the sum of lines (± allowances/charges) at that exact rate. Check that line rates and breakdown rates match to the decimal.",
  "BR-E-10": "Exempt invoices (category E) must state why: add a VAT exemption reason text (BT-120) or a VATEX reason code (BT-121).",
  "BR-AE-10": "Reverse-charge invoices (category AE) must carry an exemption reason saying so — text \"Reverse charge\" or the corresponding VATEX code.",
  "BR-IC-11": "Intra-community supplies must state the delivery date (BT-72) or an invoicing period (BG-14).",
  "BR-IC-12": "Intra-community supplies must state the destination: add a deliver-to address with country code (BT-80).",
  "BR-Z-01": "Zero-rated items (category Z) need exactly one matching Z row in the VAT breakdown with tax amount 0.",
  "BR-O-01": "\"Not subject to VAT\" (category O) invoices must contain exactly one VAT breakdown row with category O — and no VAT identifiers or rates anywhere.",
  "BR-48": "Every VAT breakdown row needs a rate (BT-119) — except category O, which must not have one.",
  "BR-49": "Payment instructions need a payment means code (BT-81): 30 credit transfer, 58 SEPA credit transfer, 59 SEPA direct debit, 48 card.",
  "BR-50": "If you provide bank account details, the account identifier (IBAN, BT-84) is mandatory.",
  "BR-61": "Payment means 30/58 (credit transfer) require an account identifier (BT-84) — add the IBAN.",
  "BR-52": "Every attached/referenced supporting document needs a reference identifier (BT-122).",
  "BR-53": "If you state a VAT accounting currency (BT-6), you must also provide the VAT total in that currency (BT-111).",
  "BR-64": "The item standard identifier needs a scheme (schemeID) — usually 0160 for GTIN.",
  "BR-CL-01": "Use a document type code from UNTDID 1001: 380 for invoices, 381 for credit notes. Codes like \"INVOICE\" or 999 are not valid.",
  "BR-CL-03": "Every amount's currencyID must be a valid ISO 4217 code. Watch for typos like \"EURO\" or lowercase \"eur\".",
  "BR-CL-10": "Party identifier schemeIDs must come from the ISO 6523 ICD list (e.g. 0088 GLN, 0060 DUNS, 0208 Belgian CBE). National IDs without a scheme should omit schemeID entirely.",
  "BR-CL-14": "Country codes are two-letter ISO 3166-1: DE, FR, SK. Greece is GR here (EL is only for VAT prefixes).",
  "BR-CL-16": "The payment means code must come from UNTDID 4461. The safe common values: 30, 58, 59, 48, 68.",
  "BR-CL-17": "VAT category codes come from UNCL 5305: S standard, Z zero, E exempt, AE reverse charge, K intra-community, G export, O not subject, L IGIC, M IPSI, B split payment.",
  "BR-CL-21": "Item standard identifier schemeID must be an ISO 6523 ICD code — 0160 for GTIN/EAN.",
  "BR-CL-22": "The exemption reason code must come from the VATEX list, uppercase (e.g. VATEX-EU-AE for reverse charge, VATEX-EU-IC for intra-community). Lowercase variants fail.",
  "BR-CL-23": "The unit code must come from UN/ECE Rec 20/21. Common valid codes: C62 piece, HUR hour, DAY day, KGM kg, MTR metre, LTR litre, KWH kWh, MON month. \"Stk\", \"pcs\" or \"hod\" are not valid.",
  "BR-CL-24": "Attachment MIME type must be one of: application/pdf, image/png, image/jpeg, text/csv, and the two spreadsheet types. Other formats must be sent as external links (BT-124).",
  "BR-CL-25": "The electronic address schemeID must come from the EAS list — e.g. 0088 GLN, 9930 German VAT, 0208 Belgian CBE, 9944 Dutch VAT. An email address uses scheme EM.",
};

const GROUPS: Array<[RegExp, string]> = [
  [/^BR-CL-/, "Code lists (BR-CL)"],
  [/^BR-CO-/, "Calculations & conditions (BR-CO)"],
  [/^BR-DEC-/, "Decimal precision (BR-DEC)"],
  [/^BR-S-/, "VAT: standard rated (BR-S)"],
  [/^BR-Z-/, "VAT: zero rated (BR-Z)"],
  [/^BR-E-/, "VAT: exempt (BR-E)"],
  [/^BR-AE-/, "VAT: reverse charge (BR-AE)"],
  [/^BR-IC-/, "VAT: intra-community (BR-IC)"],
  [/^BR-G-/, "VAT: export (BR-G)"],
  [/^BR-O-/, "VAT: not subject (BR-O)"],
  [/^BR-AF-/, "VAT: IGIC (BR-AF)"],
  [/^BR-AG-/, "VAT: IPSI (BR-AG)"],
  [/^BR-B-/, "VAT: split payment (BR-B)"],
  [/^BR-/, "Core rules (BR)"],
];

/** The full EN 16931 rule catalog: official texts + curated fix guidance. */
export function ruleCatalog(): CatalogEntry[] {
  return Object.entries(RULE_TEXTS).map(([id, info]) => ({
    id,
    ...info,
    group: GROUPS.find(([re]) => re.test(id))?.[1] ?? "Other",
    fix: FIXES[id],
  }));
}
