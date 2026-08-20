/**
 * Peppol BIS Billing 3.0 rules (PEPPOL-EN16931-*), implemented over the
 * semantic model.
 *
 * Source of truth: the official OpenPeppol Schematron
 * (OpenPEPPOL/peppol-bis-invoice-3). The pack runs automatically when the
 * invoice declares the Peppol billing specification identifier (BT-24).
 *
 * Not covered (documented): syntax-only rules that require raw-XML structure
 * (R008 empty elements, R043/R044 indicator lexicals, R053/R054 TaxTotal
 * grouping, R080/R100/R101 cardinalities collapsed by the semantic model)
 * and the country-specific sub-packs (NO-R-*, DK-R-*, IT-R-*, SE-R-*…).
 */

import { Dec } from "./decimal.js";
import { Invoice } from "./model.js";
import { Ctx, dec, decOrZero, has, isIsoDate, lineWhere, r2 } from "./rules-util.js";

/** True when BT-24 declares Peppol BIS Billing 3.0. */
export function isPeppol(inv: Invoice): boolean {
  return /urn:fdc:peppol\.eu:2017:poacc:billing/i.test(inv.specificationId ?? "");
}

const PEPPOL_SPEC = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
const TYPE_CODES = new Set(["326", "380", "384", "389", "381", "875", "876", "877"]);
const VATEX_CATEGORY: Array<[string, string, string]> = [
  // [exemption reason code, required category, rule id]
  ["VATEX-EU-G", "G", "PEPPOL-EN16931-P0104"],
  ["VATEX-EU-O", "O", "PEPPOL-EN16931-P0105"],
  ["VATEX-EU-IC", "K", "PEPPOL-EN16931-P0106"],
  ["VATEX-EU-AE", "AE", "PEPPOL-EN16931-P0107"],
  ["VATEX-EU-D", "E", "PEPPOL-EN16931-P0108"],
  ["VATEX-EU-F", "E", "PEPPOL-EN16931-P0109"],
  ["VATEX-EU-I", "E", "PEPPOL-EN16931-P0110"],
  ["VATEX-EU-J", "E", "PEPPOL-EN16931-P0111"],
];

/** |a − b| ≤ 0.02 — the official Peppol slack for computed amounts. */
const withinSlack = (a: Dec, b: Dec): boolean => a.sub(b).abs().cmp(Dec.parse("0.02")!) <= 0;

export function peppolRules(c: Ctx): void {
  const inv = c.inv;
  const isDeDomestic = inv.seller?.address?.countryCode === "DE" && inv.buyer?.address?.countryCode === "DE";

  c.check(has(inv.businessProcess), "PEPPOL-EN16931-R001", "Business process MUST be provided.", {
    hint: "Add the ProfileID, normally urn:fdc:peppol.eu:2017:poacc:billing:01:1.0.",
  });
  if (has(inv.businessProcess)) {
    c.check(/^urn:fdc:peppol\.eu:2017:poacc:billing:\d\d:1\.0$/.test(inv.businessProcess!), "PEPPOL-EN16931-R007", "Business process MUST be in the format 'urn:fdc:peppol.eu:2017:poacc:billing:NN:1.0' where NN indicates the process number.", {
      hint: `"${inv.businessProcess}" — the standard value is urn:fdc:peppol.eu:2017:poacc:billing:01:1.0.`,
    });
  }
  c.check(inv.specificationId === PEPPOL_SPEC, "PEPPOL-EN16931-R004", `Specification identifier MUST have the value '${PEPPOL_SPEC}'.`);
  c.check(inv.notes.length <= 1 || isDeDomestic, "PEPPOL-EN16931-R002", "No more than one note is allowed on document level, unless both the buyer and seller are German organizations.");
  c.check(has(inv.buyerReference) || has(inv.purchaseOrderReference), "PEPPOL-EN16931-R003", "A buyer reference or purchase order reference MUST be provided.", {
    hint: "Peppol requires BT-10 (buyer reference) or BT-13 (order reference) so the receiver can route the invoice.",
  });
  if (has(inv.vatCurrency)) {
    c.check(inv.vatCurrency !== inv.currency, "PEPPOL-EN16931-R005", "VAT accounting currency code MUST be different from invoice currency code when provided.");
  }
  c.check(!!inv.buyer?.electronicAddress, "PEPPOL-EN16931-R010", "Buyer electronic address MUST be provided.", {
    hint: "Peppol delivery needs the buyer's participant address (EndpointID with an EAS scheme, e.g. 0208 for Belgian CBE).",
  });
  c.check(!!inv.seller?.electronicAddress, "PEPPOL-EN16931-R020", "Seller electronic address MUST be provided.");

  if (has(inv.typeCode)) {
    c.check(TYPE_CODES.has(inv.typeCode!), "PEPPOL-EN16931-P0100", "Invoice type code MUST be set according to the profile.", {
      hint: `Peppol BIS allows type codes 326, 380, 381, 384, 389, 875, 876, 877 — not "${inv.typeCode}".`,
    });
    c.check(!(["326", "384"].includes(inv.typeCode!) && !isDeDomestic) || inv.precedingInvoices.length > 0 || inv.typeCode !== "384", "PEPPOL-EN16931-P0112", "Invoice type code 326 or 384 are only allowed when both buyer and seller are German organizations.", {
      hint: "Partial (326) and corrected (384) invoices are a German extension inside Peppol BIS.",
    });
  }

  // Allowances/charges: percentage/base pairing and computation (±0.02 slack).
  const checkAc = (acs: Invoice["allowancesCharges"], where?: string) => {
    acs.forEach((ac, i) => {
      const loc = where ?? `document level ${ac.isCharge ? "charge" : "allowance"} ${i + 1}`;
      const base = dec(ac.baseAmount);
      const pct = dec(ac.percentage);
      if (pct && !base) c.fail("PEPPOL-EN16931-R041", "Allowance/charge base amount MUST be provided when allowance/charge percentage is provided.", { where: loc });
      if (base && !pct) c.fail("PEPPOL-EN16931-R042", "Allowance/charge percentage MUST be provided when allowance/charge base amount is provided.", { where: loc });
      const amt = dec(ac.amount);
      if (base && pct && amt) {
        const expected = r2(base.mul(pct.divPercent()));
        c.check(withinSlack(amt, expected), "PEPPOL-EN16931-R040", "Allowance/charge amount must equal base amount * percentage/100 if base amount and percentage exists.", {
          where: loc,
          hint: `Amount is ${amt.toString()} but ${base.toString()} × ${pct.toString()}% = ${expected.toString()}.`,
        });
      }
    });
  };
  checkAc(inv.allowancesCharges);
  inv.lines.forEach((l, i) => checkAc(l.allowancesCharges, lineWhere(l, i)));

  // Price rules.
  inv.lines.forEach((l, i) => {
    const where = lineWhere(l, i);
    const gross = dec(l.price?.grossPrice);
    const net = dec(l.price?.netPrice);
    const discount = dec(l.price?.discount) ?? Dec.ZERO;
    if (gross && net) {
      c.check(net.eq(gross.sub(discount)), "PEPPOL-EN16931-R046", "Item net price MUST equal (Gross price - Allowance amount) when gross price is provided.", {
        where,
        hint: `Net price is ${net.toString()} but ${gross.toString()} − ${discount.toString()} = ${gross.sub(discount).toString()}.`,
      });
    }
    const baseQty = dec(l.price?.baseQuantity);
    if (baseQty !== undefined) {
      c.check(baseQty.isPositive(), "PEPPOL-EN16931-R121", "Base quantity MUST be a positive number above zero.", { where });
    }
    if (has(l.price?.baseQuantityUnit) && has(l.unitCode)) {
      c.check(l.price!.baseQuantityUnit === l.unitCode, "PEPPOL-EN16931-R130", "Unit code of price base quantity MUST be same as invoiced quantity.", { where });
    }

    // R120: line net = qty × (price / baseQty) + line charges − line allowances, ±0.02.
    const qty = dec(l.quantity);
    const lineNet = dec(l.netAmount);
    if (qty && net && lineNet) {
      const bq = baseQty && baseQty.isPositive() ? baseQty : Dec.parse("1")!;
      const unitPrice = net.div(bq, 10);
      if (unitPrice) {
        let expected = qty.mul(unitPrice);
        for (const ac of l.allowancesCharges) {
          const a = decOrZero(ac.amount);
          expected = ac.isCharge ? expected.add(a) : expected.sub(a);
        }
        c.check(withinSlack(lineNet, r2(expected)), "PEPPOL-EN16931-R120", "Invoice line net amount MUST equal (Invoiced quantity * (Item net price/item price base quantity) + Sum of invoice line charge amount - sum of invoice line allowance amount).", {
          where,
          hint: `Line net is ${lineNet.toString()} but ${qty.toString()} × ${net.toString()}${bq.eq(Dec.parse("1")!) ? "" : `/${bq.toString()}`} ± line allowances/charges = ${r2(expected).toString()}.`,
        });
      }
    }

    // R110/R111: line period within invoicing period.
    if (inv.period && l.period) {
      if (isIsoDate(inv.period.start) && isIsoDate(l.period.start)) {
        c.check(l.period.start! >= inv.period.start!, "PEPPOL-EN16931-R110", "Start date of line period MUST be within invoice period.", { where });
      }
      if (isIsoDate(inv.period.end) && isIsoDate(l.period.end)) {
        c.check(l.period.end! <= inv.period.end!, "PEPPOL-EN16931-R111", "End date of line period MUST be within invoice period.", { where });
      }
    }
  });

  // R051: all amounts in the invoice currency (except BT-111).
  if (has(inv.currency)) {
    const wrong = collectCurrencies(inv).filter((cur) => cur !== undefined && cur !== inv.currency);
    c.check(wrong.length === 0, "PEPPOL-EN16931-R051", "All currencyID attributes must have the same value as the invoice currency code (BT-5), except for the invoice total VAT amount in accounting currency (BT-111).", {
      hint: wrong.length ? `Found currency "${wrong[0]}" where ${inv.currency} was expected.` : undefined,
    });
  }

  // R055: BT-110 and BT-111 must have the same sign.
  const vat = dec(inv.totals.vatTotal);
  const vatAcc = dec(inv.totals.vatTotalAccounting);
  if (vat && vatAcc) {
    c.check(vat.isNegative() === vatAcc.isNegative() || vat.isZero() || vatAcc.isZero(), "PEPPOL-EN16931-R055", "Invoice total VAT amount and Invoice total VAT amount in accounting currency MUST have the same operational sign.");
  }

  // R061: direct debit requires the mandate reference.
  const debitPresent = has(inv.payment?.directDebit?.mandateId) || has(inv.payment?.directDebit?.debitedAccount) || inv.payment?.meansCode === "59";
  if (inv.payment?.meansCode === "59" && debitPresent) {
    c.check(has(inv.payment.directDebit?.mandateId), "PEPPOL-EN16931-R061", "Mandate reference MUST be provided for direct debit.", {
      hint: "Direct debit (payment means 59) requires the SEPA mandate reference (BT-89).",
    });
  }

  // F001: dates formatted YYYY-MM-DD.
  const dates: Array<[string | undefined, string]> = [
    [inv.issueDate, "issue date (BT-2)"],
    [inv.dueDate, "due date (BT-9)"],
    [inv.taxPointDate, "tax point date (BT-7)"],
    [inv.delivery?.date, "delivery date (BT-72)"],
    [inv.period?.start, "invoicing period start (BT-73)"],
    [inv.period?.end, "invoicing period end (BT-74)"],
  ];
  for (const [d, label] of dates) {
    if (has(d)) c.check(isIsoDate(d), "PEPPOL-EN16931-F001", "A date MUST be formatted YYYY-MM-DD.", { where: label });
  }

  // P0104..P0111: VATEX exemption codes bind the category.
  for (const b of inv.vatBreakdowns) {
    if (!has(b.exemptionReasonCode)) continue;
    const code = b.exemptionReasonCode!.toUpperCase();
    for (const [vatex, category, rule] of VATEX_CATEGORY) {
      if (code === vatex) {
        c.check(b.categoryCode === category, rule, `Tax Category ${category} MUST be used when exemption reason code is ${vatex}.`, {
          hint: `The breakdown uses category ${b.categoryCode ?? "?"} with exemption code ${vatex}, which requires category ${category}.`,
        });
      }
    }
  }
}

function collectCurrencies(inv: Invoice): Array<string | undefined> {
  const out: Array<string | undefined> = [];
  const push = (a?: { currency?: string }) => {
    if (a?.currency !== undefined) out.push(a.currency);
  };
  const t = inv.totals;
  [t.lineTotal, t.allowanceTotal, t.chargeTotal, t.taxExclusive, t.vatTotal, t.taxInclusive, t.paid, t.rounding, t.payable].forEach(push);
  for (const b of inv.vatBreakdowns) [b.taxableAmount, b.taxAmount].forEach(push);
  for (const ac of inv.allowancesCharges) [ac.amount, ac.baseAmount].forEach(push);
  for (const l of inv.lines) {
    push(l.netAmount);
    if (l.price) [l.price.netPrice, l.price.discount, l.price.grossPrice].forEach(push);
    for (const ac of l.allowancesCharges) [ac.amount, ac.baseAmount].forEach(push);
  }
  return out;
}
