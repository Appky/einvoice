/**
 * EN 16931 core business rules (BR-*), calculation rules (BR-CO-*) and
 * decimal rules (BR-DEC-*), implemented natively over the semantic model.
 *
 * Rule texts follow the published EN 16931 validation artefacts. Arithmetic
 * semantics (rounding, ±1 tolerances, treatment of absent terms) mirror the
 * official Schematron expressions exactly.
 */

import { Dec, lexicalFractionDigits } from "./decimal.js";
import { Ctx, acWhere, breakdownWhere, dec, decOrZero, has, isIsoDate, lineWhere, netSum, r2, withinOne } from "./rules-util.js";
import { CODES_BR_CO_09 } from "./gen/codelists.js";

export function coreRules(c: Ctx): void {
  const inv = c.inv;

  // ——— Document level (BR-01..BR-16, BR-53) ———
  c.check(has(inv.specificationId), "BR-01", "An Invoice shall have a Specification identifier (BT-24).", {
    hint: "Add a CustomizationID (UBL) / GuidelineSpecifiedDocumentContextParameter (CII) identifying the EN 16931 specification the invoice follows.",
  });
  c.check(has(inv.number), "BR-02", "An Invoice shall have an Invoice number (BT-1).");
  c.check(has(inv.issueDate), "BR-03", "An Invoice shall have an Invoice issue date (BT-2).");
  c.check(has(inv.typeCode), "BR-04", "An Invoice shall have an Invoice type code (BT-3).");
  c.check(has(inv.currency), "BR-05", "An Invoice shall have an Invoice currency code (BT-5).");
  c.check(has(inv.seller?.name), "BR-06", "An Invoice shall contain the Seller name (BT-27).");
  c.check(has(inv.buyer?.name), "BR-07", "An Invoice shall contain the Buyer name (BT-44).");
  c.check(!!inv.seller?.address, "BR-08", "An Invoice shall contain the Seller postal address (BG-5).");
  c.check(
    !inv.seller || !inv.seller.address || has(inv.seller.address.countryCode),
    "BR-09",
    "The Seller postal address shall contain a Seller country code (BT-40).",
  );
  c.check(!!inv.buyer?.address, "BR-10", "An Invoice shall contain the Buyer postal address (BG-8).");
  c.check(
    !inv.buyer || !inv.buyer.address || has(inv.buyer.address.countryCode),
    "BR-11",
    "The Buyer postal address shall contain a Buyer country code (BT-55).",
  );
  c.check(has(inv.totals.lineTotal), "BR-12", "An Invoice shall have the Sum of Invoice line net amount (BT-106).");
  c.check(has(inv.totals.taxExclusive), "BR-13", "An Invoice shall have the Invoice total amount without VAT (BT-109).");
  c.check(has(inv.totals.taxInclusive), "BR-14", "An Invoice shall have the Invoice total amount with VAT (BT-112).");
  c.check(has(inv.totals.payable), "BR-15", "An Invoice shall have the Amount due for payment (BT-115).");
  c.check(inv.lines.length >= 1, "BR-16", "An Invoice shall have at least one Invoice line (BG-25).");
  c.check(
    !has(inv.vatCurrency) ||
      has(inv.totals.vatTotalAccounting) ||
      (inv.vatCurrency === inv.currency && has(inv.totals.vatTotal)),
    "BR-53",
    "If the VAT accounting currency code (BT-6) is present, then the Invoice total VAT amount in accounting currency (BT-111) shall be provided.",
  );

  // ——— Payee / tax representative (BR-17..BR-20) ———
  c.check(!inv.payee || has(inv.payee.name), "BR-17", "The Payee name (BT-59) shall be provided in the Invoice, if the Payee (BG-10) is different from the Seller (BG-4).");
  c.check(!inv.taxRepresentative || has(inv.taxRepresentative.name), "BR-18", "The Seller tax representative name (BT-62) shall be provided in the Invoice, if the Seller (BG-4) has a Seller tax representative party (BG-11).");
  c.check(!inv.taxRepresentative || !!inv.taxRepresentative.address, "BR-19", "The Seller tax representative postal address (BG-12) shall be provided in the Invoice, if the Seller (BG-4) has a Seller tax representative party (BG-11).");
  c.check(
    !inv.taxRepresentative || !inv.taxRepresentative.address || has(inv.taxRepresentative.address.countryCode),
    "BR-20",
    "The Seller tax representative postal address (BG-12) shall contain a Tax representative country code (BT-69).",
  );
  c.check(!inv.taxRepresentative || has(inv.taxRepresentative.vatId), "BR-56", "Each Seller tax representative party (BG-11) shall have a Seller tax representative VAT identifier (BT-63).");

  // ——— Lines (BR-21..BR-28) ———
  inv.lines.forEach((l, i) => {
    const where = lineWhere(l, i);
    c.check(has(l.id), "BR-21", "Each Invoice line (BG-25) shall have an Invoice line identifier (BT-126).", { where });
    c.check(has(l.quantity), "BR-22", "Each Invoice line (BG-25) shall have an Invoiced quantity (BT-129).", { where });
    c.check(has(l.unitCode), "BR-23", "An Invoice line (BG-25) shall have an Invoiced quantity unit of measure code (BT-130).", { where });
    c.check(has(l.netAmount), "BR-24", "Each Invoice line (BG-25) shall have an Invoice line net amount (BT-131).", { where });
    c.check(has(l.item?.name), "BR-25", "Each Invoice line (BG-25) shall contain the Item name (BT-153).", { where });
    c.check(has(l.price?.netPrice), "BR-26", "Each Invoice line (BG-25) shall contain the Item net price (BT-146).", { where });
    const net = dec(l.price?.netPrice);
    c.check(!net || !net.isNegative(), "BR-27", "The Item net price (BT-146) shall NOT be negative.", {
      where,
      hint: "Negative unit prices are not allowed; model discounts with allowances or negative quantities instead.",
    });
    const gross = dec(l.price?.grossPrice);
    c.check(!gross || !gross.isNegative(), "BR-28", "The Item gross price (BT-148) shall NOT be negative.", { where });
    c.check(has(l.vat?.categoryCode), "BR-CO-04", "Each Invoice line (BG-25) shall be categorized with an Invoiced item VAT category code (BT-151).", { where });
    if (l.netAmount) {
      c.check(lexicalFractionDigits(l.netAmount.raw) <= 2, "BR-DEC-23", "The allowed maximum number of decimals for the Invoice line net amount (BT-131) is 2.", { where });
    }
    // Line period (BR-30, BR-CO-20)
    if (l.period) {
      c.check(has(l.period.start) || has(l.period.end), "BR-CO-20", "If Invoice line period (BG-26) is used, the Invoice line period start date (BT-134) or the Invoice line period end date (BT-135) shall be filled, or both.", { where });
      if (isIsoDate(l.period.start) && isIsoDate(l.period.end)) {
        c.check(l.period.end! >= l.period.start!, "BR-30", "If both Invoice line period start date (BT-134) and Invoice line period end date (BT-135) are given then the Invoice line period end date (BT-135) shall be later or equal to the Invoice line period start date (BT-134).", { where });
      }
    }
    // Line allowances/charges (BR-41..BR-44, BR-CO-23/24, BR-DEC-24/25/27/28)
    l.allowancesCharges.forEach((ac) => {
      const acKind = ac.isCharge ? "charge" : "allowance";
      const acw = `${where}, ${acKind}`;
      if (!ac.isCharge) {
        c.check(has(ac.amount), "BR-41", "Each Invoice line allowance (BG-27) shall have an Invoice line allowance amount (BT-136).", { where: acw });
        c.check(has(ac.reason) || has(ac.reasonCode), "BR-42", "Each Invoice line allowance (BG-27) shall have an Invoice line allowance reason (BT-139) or an Invoice line allowance reason code (BT-140).", { where: acw });
        if (ac.amount) c.check(lexicalFractionDigits(ac.amount.raw) <= 2, "BR-DEC-24", "The allowed maximum number of decimals for the Invoice line allowance amount (BT-136) is 2.", { where: acw });
        if (ac.baseAmount) c.check(lexicalFractionDigits(ac.baseAmount.raw) <= 2, "BR-DEC-25", "The allowed maximum number of decimals for the Invoice line allowance base amount (BT-137) is 2.", { where: acw });
      } else {
        c.check(has(ac.amount), "BR-43", "Each Invoice line charge (BG-28) shall have an Invoice line charge amount (BT-141).", { where: acw });
        c.check(has(ac.reason) || has(ac.reasonCode), "BR-44", "Each Invoice line charge shall have an Invoice line charge reason (BT-144) or an Invoice line charge reason code (BT-145).", { where: acw });
        if (ac.amount) c.check(lexicalFractionDigits(ac.amount.raw) <= 2, "BR-DEC-27", "The allowed maximum number of decimals for the Invoice line charge amount (BT-141) is 2.", { where: acw });
        if (ac.baseAmount) c.check(lexicalFractionDigits(ac.baseAmount.raw) <= 2, "BR-DEC-28", "The allowed maximum number of decimals for the Invoice line charge base amount (BT-142) is 2.", { where: acw });
      }
    });
    // Item identifiers (BR-64, BR-65)
    if (l.item?.standardId) {
      c.check(has(l.item.standardId.scheme), "BR-64", "The Item standard identifier (BT-157) shall have a Scheme identifier.", { where });
    }
    for (const cls of l.item?.classificationIds ?? []) {
      c.check(has(cls.scheme), "BR-65", "The Item classification identifier (BT-158) shall have a Scheme identifier.", { where });
    }
  });

  // ——— Invoicing period (BR-29, BR-CO-19) ———
  if (inv.period) {
    c.check(has(inv.period.start) || has(inv.period.end), "BR-CO-19", "If Invoicing period (BG-14) is used, the Invoicing period start date (BT-73) or the Invoicing period end date (BT-74) shall be filled, or both.");
    if (isIsoDate(inv.period.start) && isIsoDate(inv.period.end)) {
      c.check(inv.period.end! >= inv.period.start!, "BR-29", "If both Invoicing period start date (BT-73) and Invoicing period end date (BT-74) are given then the Invoicing period end date (BT-74) shall be later or equal to the Invoicing period start date (BT-73).");
    }
  }

  // ——— Document allowances/charges (BR-31..BR-38, BR-CO-21/22, BR-DEC-01/02/05/06) ———
  inv.allowancesCharges.forEach((ac, i) => {
    const where = acWhere(ac, i);
    if (!ac.isCharge) {
      c.check(has(ac.amount), "BR-31", "Each Document level allowance (BG-20) shall have a Document level allowance amount (BT-92).", { where });
      c.check(has(ac.vatCategory), "BR-32", "Each Document level allowance (BG-20) shall have a Document level allowance VAT category code (BT-95).", { where });
      c.check(has(ac.reason) || has(ac.reasonCode), "BR-33", "Each Document level allowance (BG-20) shall have a Document level allowance reason (BT-97) or a Document level allowance reason code (BT-98).", { where });
      if (ac.amount) c.check(lexicalFractionDigits(ac.amount.raw) <= 2, "BR-DEC-01", "The allowed maximum number of decimals for the Document level allowance amount (BT-92) is 2.", { where });
      if (ac.baseAmount) c.check(lexicalFractionDigits(ac.baseAmount.raw) <= 2, "BR-DEC-02", "The allowed maximum number of decimals for the Document level allowance base amount (BT-93) is 2.", { where });
    } else {
      c.check(has(ac.amount), "BR-36", "Each Document level charge (BG-21) shall have a Document level charge amount (BT-99).", { where });
      c.check(has(ac.vatCategory), "BR-37", "Each Document level charge (BG-21) shall have a Document level charge VAT category code (BT-102).", { where });
      c.check(has(ac.reason) || has(ac.reasonCode), "BR-38", "Each Document level charge (BG-21) shall have a Document level charge reason (BT-104) or a Document level charge reason code (BT-105).", { where });
      if (ac.amount) c.check(lexicalFractionDigits(ac.amount.raw) <= 2, "BR-DEC-05", "The allowed maximum number of decimals for the Document level charge amount (BT-99) is 2.", { where });
      if (ac.baseAmount) c.check(lexicalFractionDigits(ac.baseAmount.raw) <= 2, "BR-DEC-06", "The allowed maximum number of decimals for the Document level charge base amount (BT-100) is 2.", { where });
    }
  });

  // ——— VAT breakdowns (BR-45..BR-48, BR-DEC-19/20) ———
  c.check(inv.vatBreakdowns.length >= 1, "BR-CO-18", "An Invoice shall at least have one VAT breakdown group (BG-23).");
  inv.vatBreakdowns.forEach((b, i) => {
    const where = breakdownWhere(b, i);
    c.check(has(b.taxableAmount), "BR-45", "Each VAT breakdown (BG-23) shall have a VAT category taxable amount (BT-116).", { where });
    c.check(has(b.taxAmount), "BR-46", "Each VAT breakdown (BG-23) shall have a VAT category tax amount (BT-117).", { where });
    c.check(has(b.categoryCode), "BR-47", "Each VAT breakdown (BG-23) shall be defined through a VAT category code (BT-118).", { where });
    c.check(b.categoryCode === "O" || has(b.rate), "BR-48", "Each VAT breakdown (BG-23) shall have a VAT category rate (BT-119), except if the Invoice is not subject to VAT.", { where });
    if (b.taxableAmount) c.check(lexicalFractionDigits(b.taxableAmount.raw) <= 2, "BR-DEC-19", "The allowed maximum number of decimals for the VAT category taxable amount (BT-116) is 2.", { where });
    if (b.taxAmount) c.check(lexicalFractionDigits(b.taxAmount.raw) <= 2, "BR-DEC-20", "The allowed maximum number of decimals for the VAT category tax amount (BT-117) is 2.", { where });
  });

  // ——— Payment (BR-49, BR-50, BR-61, BR-51 warning) ———
  if (inv.payment) {
    c.check(has(inv.payment.meansCode), "BR-49", "A Payment instruction (BG-16) shall specify the Payment means type code (BT-81).");
    const sepaLike = inv.payment.meansCode === "30" || inv.payment.meansCode === "58";
    if (sepaLike && inv.payment.creditTransfers.length > 0) {
      c.check(
        inv.payment.creditTransfers.every((ct) => has(ct.accountId)),
        "BR-61",
        "If the Payment means type code (BT-81) means SEPA credit transfer, Local credit transfer or Non-SEPA international credit transfer, the Payment account identifier (BT-84) shall be present.",
        { hint: "Payment means code 30/58 (credit transfer) requires an IBAN or account identifier in BT-84." },
      );
    }
    for (const ct of inv.payment.creditTransfers) {
      if (has(ct.accountName) || has(ct.providerId)) {
        c.check(has(ct.accountId), "BR-50", "A Payment account identifier (BT-84) shall be present if Credit transfer (BG-17) information is provided in the Invoice.");
      }
    }
    if (has(inv.payment.card?.pan)) {
      const pan = inv.payment.card!.pan!;
      c.check(pan.length <= 10, "BR-51", "In accordance with card payments security standards an invoice should never include a full card primary account number (BT-87).", {
        severity: "warning",
        hint: "Show at most the first 6 and last 4 digits of the card number.",
      });
    }
  }

  // ——— Preceding invoices / supporting documents (BR-55, BR-52) ———
  inv.precedingInvoices.forEach((p) => {
    c.check(has(p.reference), "BR-55", "Each Preceding Invoice reference (BG-3) shall contain a Preceding Invoice reference (BT-25).");
  });
  inv.supportingDocuments.forEach((d, i) => {
    c.check(has(d.reference), "BR-52", "Each Additional supporting document (BG-24) shall contain a Supporting document reference (BT-122).", { where: `supporting document ${i + 1}` });
  });

  // ——— Item attributes (BR-54) ———
  inv.lines.forEach((l, i) => {
    for (const attr of l.item?.attributes ?? []) {
      c.check(has(attr.name) && has(attr.value), "BR-54", "Each Item attribute (BG-32) shall contain an Item attribute name (BT-160) and an Item attribute value (BT-161).", { where: lineWhere(l, i) });
    }
  });

  // ——— Electronic addresses & identifiers (BR-62, BR-63, BR-CO-26) ———
  if (inv.seller?.electronicAddress) {
    c.check(has(inv.seller.electronicAddress.scheme), "BR-62", "The Seller electronic address (BT-34) shall have a Scheme identifier.");
  }
  if (inv.buyer?.electronicAddress) {
    c.check(has(inv.buyer.electronicAddress.scheme), "BR-63", "The Buyer electronic address (BT-49) shall have a Scheme identifier.");
  }
  if (inv.seller) {
    c.check(
      inv.seller.identifiers.length > 0 || has(inv.seller.legalRegistrationId?.value) || has(inv.seller.vatId),
      "BR-CO-26",
      "In order for the buyer to automatically identify a supplier, the Seller identifier (BT-29), the Seller legal registration identifier (BT-30) and/or the Seller VAT identifier (BT-31) shall be present.",
    );
  }

  // ——— Mutual exclusion (BR-CO-03) ———
  c.check(!(has(inv.taxPointDate) && has(inv.taxPointDateCode)), "BR-CO-03", "Value added tax point date (BT-7) and Value added tax point date code (BT-8) are mutually exclusive.");

  // ——— VAT identifier prefixes (BR-CO-09) ———
  const prefixes = CODES_BR_CO_09 as ReadonlySet<string>;
  for (const [vatId, who] of [
    [inv.seller?.vatId, "Seller VAT identifier (BT-31)"],
    [inv.taxRepresentative?.vatId, "Seller tax representative VAT identifier (BT-63)"],
    [inv.buyer?.vatId, "Buyer VAT identifier (BT-48)"],
  ] as const) {
    if (has(vatId)) {
      c.check(prefixes.has(vatId!.slice(0, 2).toUpperCase()), "BR-CO-09", "The Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63) and the Buyer VAT identifier (BT-48) shall have a prefix in accordance with ISO code ISO 3166-1 alpha-2 by which the country of issue may be identified. Nevertheless, Greece may use the prefix 'EL'.", {
        where: who,
        hint: `"${vatId}" does not start with a recognized country prefix (e.g. DE, FR, SK, EL for Greece).`,
      });
    }
  }

  // ——— Reason-code equivalence rules: not machine-checkable, defined as true() in the official artefacts ———
  // BR-CO-05, BR-CO-06, BR-CO-07, BR-CO-08 — intentionally not evaluated.
  // BR-CO-21/22/23/24 are equivalent to BR-33/38/42/44 which are evaluated above.

  // ——— Totals arithmetic (BR-CO-10..16, BR-DEC-09..18) ———
  const totals = inv.totals;
  const dLineTotal = dec(totals.lineTotal);
  const dAllow = dec(totals.allowanceTotal);
  const dCharge = dec(totals.chargeTotal);
  const dTaxExcl = dec(totals.taxExclusive);
  const dVat = dec(totals.vatTotal);
  const dTaxIncl = dec(totals.taxInclusive);
  const dPaid = dec(totals.paid);
  const dRounding = dec(totals.rounding);
  const dPayable = dec(totals.payable);

  const decChecks: Array<[string, string, typeof totals.lineTotal]> = [
    ["BR-DEC-09", "Sum of Invoice line net amount (BT-106)", totals.lineTotal],
    ["BR-DEC-10", "Sum of allowances on document level (BT-107)", totals.allowanceTotal],
    ["BR-DEC-11", "Sum of charges on document level (BT-108)", totals.chargeTotal],
    ["BR-DEC-12", "Invoice total amount without VAT (BT-109)", totals.taxExclusive],
    ["BR-DEC-13", "Invoice total VAT amount (BT-110)", totals.vatTotal],
    ["BR-DEC-15", "Invoice total VAT amount in accounting currency (BT-111)", totals.vatTotalAccounting],
    ["BR-DEC-14", "Invoice total amount with VAT (BT-112)", totals.taxInclusive],
    ["BR-DEC-16", "Paid amount (BT-113)", totals.paid],
    ["BR-DEC-17", "Rounding amount (BT-114)", totals.rounding],
    ["BR-DEC-18", "Amount due for payment (BT-115)", totals.payable],
  ];
  for (const [rule, label, amt] of decChecks) {
    if (amt) c.check(lexicalFractionDigits(amt.raw) <= 2, rule, `The allowed maximum number of decimals for the ${label} is 2.`);
  }

  if (dLineTotal) {
    const sum = r2(netSum(inv.lines.map((l, i) => ({ kind: "line" as const, index: i, amount: l.netAmount }))));
    c.check(dLineTotal.eq(sum), "BR-CO-10", "Sum of Invoice line net amount (BT-106) = Σ Invoice line net amount (BT-131).", {
      hint: `BT-106 is ${dLineTotal.toString()} but the invoice lines add up to ${sum.toString()}.`,
    });
  }
  const allowances = inv.allowancesCharges.filter((a) => !a.isCharge);
  const charges = inv.allowancesCharges.filter((a) => a.isCharge);
  if (dAllow || allowances.length > 0) {
    const sum = r2(allowances.reduce((s, a) => s.add(decOrZero(a.amount)), Dec.ZERO));
    c.check((dAllow ?? Dec.ZERO).eq(sum), "BR-CO-11", "Sum of allowances on document level (BT-107) = Σ Document level allowance amount (BT-92).", {
      hint: `BT-107 is ${(dAllow ?? Dec.ZERO).toString()} but the document level allowances add up to ${sum.toString()}.`,
    });
  }
  if (dCharge || charges.length > 0) {
    const sum = r2(charges.reduce((s, a) => s.add(decOrZero(a.amount)), Dec.ZERO));
    c.check((dCharge ?? Dec.ZERO).eq(sum), "BR-CO-12", "Sum of charges on document level (BT-108) = Σ Document level charge amount (BT-99).", {
      hint: `BT-108 is ${(dCharge ?? Dec.ZERO).toString()} but the document level charges add up to ${sum.toString()}.`,
    });
  }
  if (dTaxExcl && dLineTotal) {
    const expected = r2(dLineTotal.sub(dAllow ?? Dec.ZERO).add(dCharge ?? Dec.ZERO));
    c.check(dTaxExcl.eq(expected), "BR-CO-13", "Invoice total amount without VAT (BT-109) = Σ Invoice line net amount (BT-131) - Sum of allowances on document level (BT-107) + Sum of charges on document level (BT-108).", {
      hint: `BT-109 is ${dTaxExcl.toString()}, expected ${expected.toString()} (= ${dLineTotal.toString()} − ${(dAllow ?? Dec.ZERO).toString()} + ${(dCharge ?? Dec.ZERO).toString()}).`,
    });
  }
  if (inv.vatBreakdowns.length > 0 && dVat) {
    const sum = r2(inv.vatBreakdowns.reduce((s, b) => s.add(decOrZero(b.taxAmount)), Dec.ZERO));
    c.check(dVat.eq(sum), "BR-CO-14", "Invoice total VAT amount (BT-110) = Σ VAT category tax amount (BT-117).", {
      hint: `BT-110 is ${dVat.toString()} but the VAT breakdown amounts add up to ${sum.toString()}.`,
    });
  }
  if (dTaxIncl && dTaxExcl) {
    if (!dVat) {
      c.fail("BR-CO-15", "Invoice total amount with VAT (BT-112) = Invoice total amount without VAT (BT-109) + Invoice total VAT amount (BT-110).", {
        hint: "The Invoice total VAT amount (BT-110) in the invoice currency is missing.",
      });
    } else {
      const expected = r2(dTaxExcl.add(dVat));
      c.check(dTaxIncl.eq(expected), "BR-CO-15", "Invoice total amount with VAT (BT-112) = Invoice total amount without VAT (BT-109) + Invoice total VAT amount (BT-110).", {
        hint: `BT-112 is ${dTaxIncl.toString()}, expected ${expected.toString()} (= ${dTaxExcl.toString()} + ${dVat.toString()}).`,
      });
    }
  }
  if (dPayable && dTaxIncl) {
    const lhs = dRounding ? r2(dPayable.sub(dRounding)) : dPayable;
    const rhs = dPaid ? r2(dTaxIncl.sub(dPaid)) : dTaxIncl;
    c.check(lhs.eq(rhs), "BR-CO-16", "Amount due for payment (BT-115) = Invoice total amount with VAT (BT-112) - Paid amount (BT-113) + Rounding amount (BT-114).", {
      hint: `BT-115 is ${dPayable.toString()}, expected ${r2(dTaxIncl.sub(dPaid ?? Dec.ZERO).add(dRounding ?? Dec.ZERO)).toString()} (= ${dTaxIncl.toString()} − ${(dPaid ?? Dec.ZERO).toString()} + ${(dRounding ?? Dec.ZERO).toString()}).`,
    });
  }

  // ——— BR-CO-17: per-breakdown VAT amount = taxable × rate ———
  inv.vatBreakdowns.forEach((b, i) => {
    const taxable = dec(b.taxableAmount);
    const tax = dec(b.taxAmount);
    const rate = dec(b.rate);
    if (!taxable || !tax) return; // presence handled by BR-45/46
    const where = breakdownWhere(b, i);
    const text = "VAT category tax amount (BT-117) = VAT category taxable amount (BT-116) x (VAT category rate (BT-119) / 100), rounded to two decimals.";
    if (!rate || rate.round(0).isZero()) {
      c.check(tax.round(0).isZero(), "BR-CO-17", text, {
        where,
        hint: `The VAT rate is ${rate ? rate.toString() : "absent"}, so the VAT amount must be 0, not ${tax.toString()}.`,
      });
    } else {
      const expected = r2(taxable.abs().mul(rate.divPercent()));
      c.check(withinOne(tax.abs(), expected), "BR-CO-17", text, {
        where,
        hint: `BT-117 is ${tax.toString()} but ${taxable.toString()} × ${rate.toString()}% = ${expected.toString()}.`,
      });
    }
  });
}
