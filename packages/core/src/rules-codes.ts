/**
 * EN 16931 code list rules (BR-CL-*), checked against code sets extracted
 * mechanically from the official validation artefacts (see
 * scripts/gen-codelists.mjs).
 */

import { Amount, Invoice } from "./model.js";
import { Ctx, has } from "./rules-util.js";
import {
  CODES_BR_CL_01,
  CODES_BR_CL_03,
  CODES_BR_CL_04,
  CODES_BR_CL_05,
  CODES_BR_CL_06,
  CODES_BR_CL_07,
  CODES_BR_CL_10,
  CODES_BR_CL_11,
  CODES_BR_CL_13,
  CODES_BR_CL_14,
  CODES_BR_CL_15,
  CODES_BR_CL_16,
  CODES_BR_CL_17,
  CODES_BR_CL_18,
  CODES_BR_CL_19,
  CODES_BR_CL_20,
  CODES_BR_CL_21,
  CODES_BR_CL_22,
  CODES_BR_CL_23,
  CODES_BR_CL_24,
  CODES_BR_CL_25,
  CODES_BR_CL_26,
} from "./gen/codelists.js";

const inSets = (sets: ReadonlyArray<ReadonlySet<string>>, v: string): boolean => sets.some((s) => s.has(v));

function collectAmounts(inv: Invoice): Amount[] {
  const out: Amount[] = [];
  const push = (a?: Amount) => {
    if (a) out.push(a);
  };
  const t = inv.totals;
  [t.lineTotal, t.allowanceTotal, t.chargeTotal, t.taxExclusive, t.vatTotal, t.vatTotalAccounting, t.taxInclusive, t.paid, t.rounding, t.payable].forEach(push);
  for (const b of inv.vatBreakdowns) [b.taxableAmount, b.taxAmount].forEach(push);
  for (const ac of inv.allowancesCharges) [ac.amount, ac.baseAmount].forEach(push);
  for (const l of inv.lines) {
    push(l.netAmount);
    if (l.price) [l.price.netPrice, l.price.discount, l.price.grossPrice].forEach(push);
    for (const ac of l.allowancesCharges) [ac.amount, ac.baseAmount].forEach(push);
  }
  return out;
}

export function codeListRules(c: Ctx): void {
  const inv = c.inv;

  // BR-CL-01 — document type code (UNTDID 1001 invoice/credit-note subsets).
  if (has(inv.typeCode)) {
    const [invoiceCodes, creditCodes] = CODES_BR_CL_01;
    const ok =
      inv.syntax === "ubl-invoice"
        ? invoiceCodes!.has(inv.typeCode!)
        : inv.syntax === "ubl-creditnote"
          ? creditCodes!.has(inv.typeCode!)
          : invoiceCodes!.has(inv.typeCode!) || creditCodes!.has(inv.typeCode!);
    c.check(ok, "BR-CL-01", "The document type code (BT-3) MUST be coded by the invoice and credit note related code lists of UNTDID 1001.", {
      hint: `"${inv.typeCode}" is not an allowed document type code. Commercial invoices use 380; credit notes use 381.`,
    });
  }

  // BR-CL-03/04/05 — currency codes (ISO 4217).
  for (const a of collectAmounts(inv)) {
    if (a.currency !== undefined) {
      c.check(CODES_BR_CL_03.has(a.currency), "BR-CL-03", "currencyID MUST be coded using ISO code list 4217 alpha-3.", { hint: `Unknown currency "${a.currency}".` });
    }
  }
  if (has(inv.currency)) {
    c.check(CODES_BR_CL_04.has(inv.currency!), "BR-CL-04", "Invoice currency code (BT-5) MUST be coded using ISO code list 4217 alpha-3.", { hint: `Unknown currency "${inv.currency}".` });
  }
  if (has(inv.vatCurrency)) {
    c.check(CODES_BR_CL_05.has(inv.vatCurrency!), "BR-CL-05", "Tax currency code (BT-6) MUST be coded using ISO code list 4217 alpha-3.");
  }

  // BR-CL-06 — VAT point date code. UBL uses UNTDID 2005 (3, 35, 432);
  // CII expresses the same semantic via UNTDID 2475 (5, 29, 72).
  if (has(inv.taxPointDateCode)) {
    const allowed = inv.syntax === "cii" ? new Set(["5", "29", "72"]) : CODES_BR_CL_06;
    c.check(allowed.has(inv.taxPointDateCode!), "BR-CL-06", `Value added tax point date code (BT-8) MUST be coded using a restriction of ${inv.syntax === "cii" ? "UNTDID 2475" : "UNTDID 2005"}.`);
  }

  // BR-CL-07 — object identifier schemes (UNTDID 1153).
  if (inv.objectId?.scheme !== undefined) {
    c.check(CODES_BR_CL_07.has(inv.objectId.scheme), "BR-CL-07", "Object identifier identification scheme identifier (BT-18-1) MUST be coded using a restriction of UNTDID 1153.");
  }
  inv.lines.forEach((l, i) => {
    if (l.objectId?.scheme !== undefined) {
      c.check(CODES_BR_CL_07.has(l.objectId.scheme), "BR-CL-07", "Object identifier identification scheme identifier (BT-128-1) MUST be coded using a restriction of UNTDID 1153.", { where: `invoice line ${l.id ?? i + 1}` });
    }
  });

  // BR-CL-10 — party identifier schemes (ISO 6523 ICD; SEPA extension for payee).
  const cl10 = CODES_BR_CL_10;
  for (const party of [inv.seller, inv.buyer, inv.payee]) {
    for (const id of party?.identifiers ?? []) {
      if (id.scheme !== undefined) {
        c.check(inSets(cl10, id.scheme), "BR-CL-10", "Any identifier identification scheme identifier MUST be coded using one of the ISO 6523 ICD list.", { hint: `Unknown identifier scheme "${id.scheme}".` });
      }
    }
  }

  // BR-CL-11 — legal registration identifier schemes (ISO 6523 ICD).
  for (const party of [inv.seller, inv.buyer, inv.payee]) {
    const scheme = party?.legalRegistrationId?.scheme;
    if (scheme !== undefined) {
      c.check(CODES_BR_CL_11.has(scheme), "BR-CL-11", "Any registration identifier identification scheme identifier MUST be coded using one of the ISO 6523 ICD list.", { hint: `Unknown legal registration scheme "${scheme}".` });
    }
  }

  // BR-CL-13 — item classification list identifiers (UNTDID 7143).
  inv.lines.forEach((l, i) => {
    for (const cls of l.item?.classificationIds ?? []) {
      if (cls.scheme !== undefined) {
        c.check(CODES_BR_CL_13.has(cls.scheme), "BR-CL-13", "Item classification identifier identification scheme identifier (BT-158-1) MUST be coded using one of the UNTDID 7143 list.", { where: `invoice line ${l.id ?? i + 1}` });
      }
    }
  });

  // BR-CL-14/15 — country codes (ISO 3166-1 alpha-2 + EL/XI extensions).
  const addresses = [
    [inv.seller?.address?.countryCode, "Seller country code (BT-40)"],
    [inv.buyer?.address?.countryCode, "Buyer country code (BT-55)"],
    [inv.taxRepresentative?.address?.countryCode, "Tax representative country code (BT-69)"],
    [inv.delivery?.address?.countryCode, "Deliver to country code (BT-80)"],
  ] as const;
  for (const [code, label] of addresses) {
    if (has(code)) {
      c.check(CODES_BR_CL_14.has(code!), "BR-CL-14", "Country codes in an invoice MUST be coded using ISO code list 3166-1.", { where: label, hint: `Unknown country code "${code}".` });
    }
  }
  inv.lines.forEach((l, i) => {
    const code = l.item?.originCountry;
    if (has(code)) {
      c.check(CODES_BR_CL_15.has(code!), "BR-CL-15", "Country codes in an invoice MUST be coded using ISO code list 3166-1.", { where: `invoice line ${l.id ?? i + 1}, item country of origin (BT-159)` });
    }
  });

  // BR-CL-16 — payment means code (UNTDID 4461).
  if (has(inv.payment?.meansCode)) {
    c.check(CODES_BR_CL_16.has(inv.payment!.meansCode!), "BR-CL-16", "Payment means in an invoice MUST be coded using UNTDID 4461 code list.", { hint: `Unknown payment means code "${inv.payment!.meansCode}". Common codes: 30 credit transfer, 58 SEPA credit transfer, 59 SEPA direct debit, 48 card.` });
  }

  // BR-CL-17/18 — VAT category codes (UNCL 5305 subset).
  for (const b of inv.vatBreakdowns) {
    if (has(b.categoryCode)) {
      c.check(CODES_BR_CL_17.has(b.categoryCode!), "BR-CL-17", "Invoice tax categories MUST be coded using UNCL 5305 code list.", { hint: `Unknown VAT category "${b.categoryCode}". Allowed: S, Z, E, AE, K, G, O, L, M, B.` });
    }
  }
  for (const ac of inv.allowancesCharges) {
    if (has(ac.vatCategory)) {
      c.check(CODES_BR_CL_17.has(ac.vatCategory!), "BR-CL-17", "Invoice tax categories MUST be coded using UNCL 5305 code list.");
    }
  }
  inv.lines.forEach((l, i) => {
    if (has(l.vat?.categoryCode)) {
      c.check(CODES_BR_CL_18.has(l.vat!.categoryCode!), "BR-CL-18", "Invoiced item VAT category code (BT-151) MUST be coded using UNCL 5305 code list.", { where: `invoice line ${l.id ?? i + 1}` });
    }
  });

  // BR-CL-19/20 — allowance and charge reason codes (UNCL 5189 / UNTDID 7161).
  const checkReason = (isCharge: boolean, code: string | undefined, where: string) => {
    if (!has(code)) return;
    if (!isCharge) {
      c.check(CODES_BR_CL_19.has(code!), "BR-CL-19", "Coded allowance reasons MUST belong to the UNCL 5189 code list.", { where });
    } else {
      c.check(CODES_BR_CL_20.has(code!), "BR-CL-20", "Coded charge reasons MUST belong to the UNTDID 7161 code list.", { where });
    }
  };
  inv.allowancesCharges.forEach((ac, i) => checkReason(ac.isCharge, ac.reasonCode, `document level ${ac.isCharge ? "charge" : "allowance"} ${i + 1}`));
  inv.lines.forEach((l, i) => l.allowancesCharges.forEach((ac) => checkReason(ac.isCharge, ac.reasonCode, `invoice line ${l.id ?? i + 1}`)));

  // BR-CL-21 — item standard identifier scheme (ISO 6523 ICD).
  inv.lines.forEach((l, i) => {
    const scheme = l.item?.standardId?.scheme;
    if (scheme !== undefined) {
      c.check(CODES_BR_CL_21.has(scheme), "BR-CL-21", "Item standard identifier scheme identifier (BT-157-1) MUST belong to the ISO 6523 ICD code list.", { where: `invoice line ${l.id ?? i + 1}` });
    }
  });

  // BR-CL-22 — VAT exemption reason code (VATEX).
  for (const b of inv.vatBreakdowns) {
    if (has(b.exemptionReasonCode)) {
      c.check(CODES_BR_CL_22.has(b.exemptionReasonCode!), "BR-CL-22", "Tax exemption reason code identifier scheme identifier (BT-121) MUST belong to the CEF VATEX code list.", { hint: `Unknown exemption reason code "${b.exemptionReasonCode}".` });
    }
  }

  // BR-CL-23 — unit of measure codes (UN/ECE Recommendation 20 and 21).
  inv.lines.forEach((l, i) => {
    const where = `invoice line ${l.id ?? i + 1}`;
    if (has(l.unitCode)) {
      c.check(CODES_BR_CL_23.has(l.unitCode!), "BR-CL-23", "Unit code (BT-130) MUST be coded according to the UN/ECE Recommendation 20 with Recommendation 21 extension.", { where, hint: `Unknown unit code "${l.unitCode}". Common codes: C62 (piece), HUR (hour), DAY, KGM (kg), MTR (metre).` });
    }
    if (has(l.price?.baseQuantityUnit)) {
      c.check(CODES_BR_CL_23.has(l.price!.baseQuantityUnit!), "BR-CL-23", "Unit code (BT-150) MUST be coded according to the UN/ECE Recommendation 20 with Recommendation 21 extension.", { where });
    }
  });

  // BR-CL-24 — attachment MIME codes.
  inv.supportingDocuments.forEach((d, i) => {
    if (has(d.attachment?.mimeCode)) {
      c.check(CODES_BR_CL_24.has(d.attachment!.mimeCode!), "BR-CL-24", "Binary object MIME code (BT-125-1) MUST be according to the allowed subset of IANA media types.", { where: `supporting document ${i + 1}`, hint: `Allowed: PDF, PNG, JPEG, CSV, XLSX, ODS.` });
    }
  });

  // BR-CL-25 — electronic address schemes (EAS).
  for (const [party, label] of [
    [inv.seller, "Seller electronic address (BT-34)"],
    [inv.buyer, "Buyer electronic address (BT-49)"],
  ] as const) {
    const scheme = party?.electronicAddress?.scheme;
    if (scheme !== undefined) {
      c.check(CODES_BR_CL_25.has(scheme), "BR-CL-25", "Electronic address identifier scheme MUST belong to the CEF EAS code list.", { where: label, hint: `Unknown EAS scheme "${scheme}". Common: 0088 (GLN), 9930 (DE VAT), 0208 (BE CBE), 9944 (NL VAT).` });
    }
  }

  // BR-CL-26 — delivery location identifier scheme (ISO 6523 ICD).
  const locScheme = inv.delivery?.locationId?.scheme;
  if (locScheme !== undefined) {
    c.check(CODES_BR_CL_26.has(locScheme), "BR-CL-26", "Delivery location identifier scheme identifier (BT-71-1) MUST belong to the ISO 6523 ICD code list.");
  }
}
