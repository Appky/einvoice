/**
 * EN 16931 VAT category rules, implemented once and parameterized over the
 * ten UNCL 5305 categories used by the standard:
 *
 *   S  Standard rated        (BR-S-*)    Z  Zero rated             (BR-Z-*)
 *   E  Exempt from VAT       (BR-E-*)    AE Reverse charge         (BR-AE-*)
 *   K  Intra-community       (BR-IC-*)   G  Export outside the EU  (BR-G-*)
 *   O  Not subject to VAT    (BR-O-*)    L  IGIC (Canary Islands)  (BR-AF-*)
 *   M  IPSI (Ceuta/Melilla)  (BR-AG-*)   B  Split payment (IT)     (BR-B-*)
 *
 * Semantics mirror the official Schematron artefacts: breakdown taxable
 * amounts for single-rate categories are exact sums; per-rate categories
 * (S, L, M) use the official ±1 currency-unit tolerance, as does the
 * tax-amount computation.
 */

import { Dec } from "./decimal.js";
import {
  Ctx,
  breakdownWhere,
  buyerLegalId,
  buyerVat,
  categoryItems,
  dec,
  has,
  netSum,
  r2,
  repVat,
  sellerTaxReg,
  sellerVat,
  withinOne,
} from "./rules-util.js";

type IdRequirement = "seller-any" | "seller-any-and-buyer" | "seller-vat-or-rep" | "seller-vat-or-rep-and-buyer-vat" | "none-allowed";

interface CategorySpec {
  code: string;
  prefix: string;
  label: string;
  /** How many VAT breakdowns of this category are required when items use it. */
  breakdownCount: "exactly-one" | "at-least-one";
  /** Constraint on the item-level VAT rate (BT-152/96/103). */
  itemRate: "zero" | "positive" | "zero-or-positive" | "absent";
  /** Which seller/buyer identifiers must (or must not) be present. */
  ids: IdRequirement;
  /** Exemption reason (BT-120/121) on the breakdown: required or forbidden. */
  exemption: "required" | "forbidden" | "ignored";
  /** Breakdown taxable amount: exact category sum, or per-rate group with ±1. */
  taxableSum: "exact" | "per-rate";
  /** Breakdown tax amount: must be zero, or computed taxable × rate with ±1. */
  taxAmount: "zero" | "computed";
  /** Rule numbers, to compose official ids like BR-AE-05. */
  nums: { breakdown: string; idsLine: string; idsAllowance: string; idsCharge: string; rateLine: string; rateAllowance: string; rateCharge: string; taxable: string; tax: string; exemption: string };
}

const N = (breakdown: number, idsLine: number, idsAllowance: number, idsCharge: number, rateLine: number, rateAllowance: number, rateCharge: number, taxable: number, tax: number, exemption: number) => ({
  breakdown: String(breakdown).padStart(2, "0"),
  idsLine: String(idsLine).padStart(2, "0"),
  idsAllowance: String(idsAllowance).padStart(2, "0"),
  idsCharge: String(idsCharge).padStart(2, "0"),
  rateLine: String(rateLine).padStart(2, "0"),
  rateAllowance: String(rateAllowance).padStart(2, "0"),
  rateCharge: String(rateCharge).padStart(2, "0"),
  taxable: String(taxable).padStart(2, "0"),
  tax: String(tax).padStart(2, "0"),
  exemption: String(exemption).padStart(2, "0"),
});

const CATEGORIES: CategorySpec[] = [
  { code: "S", prefix: "BR-S", label: "Standard rated", breakdownCount: "at-least-one", itemRate: "positive", ids: "seller-any", exemption: "forbidden", taxableSum: "per-rate", taxAmount: "computed", nums: N(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
  { code: "Z", prefix: "BR-Z", label: "Zero rated", breakdownCount: "exactly-one", itemRate: "zero", ids: "seller-any", exemption: "forbidden", taxableSum: "exact", taxAmount: "zero", nums: N(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
  { code: "E", prefix: "BR-E", label: "Exempt from VAT", breakdownCount: "exactly-one", itemRate: "zero", ids: "seller-any", exemption: "required", taxableSum: "exact", taxAmount: "zero", nums: N(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
  { code: "AE", prefix: "BR-AE", label: "Reverse charge", breakdownCount: "exactly-one", itemRate: "zero", ids: "seller-any-and-buyer", exemption: "required", taxableSum: "exact", taxAmount: "zero", nums: N(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
  { code: "K", prefix: "BR-IC", label: "Intra-community supply", breakdownCount: "exactly-one", itemRate: "zero", ids: "seller-vat-or-rep-and-buyer-vat", exemption: "required", taxableSum: "exact", taxAmount: "zero", nums: N(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
  { code: "G", prefix: "BR-G", label: "Export outside the EU", breakdownCount: "exactly-one", itemRate: "zero", ids: "seller-vat-or-rep", exemption: "required", taxableSum: "exact", taxAmount: "zero", nums: N(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
  { code: "O", prefix: "BR-O", label: "Not subject to VAT", breakdownCount: "exactly-one", itemRate: "absent", ids: "none-allowed", exemption: "required", taxableSum: "exact", taxAmount: "zero", nums: N(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
  { code: "L", prefix: "BR-AF", label: "IGIC", breakdownCount: "at-least-one", itemRate: "zero-or-positive", ids: "seller-any", exemption: "forbidden", taxableSum: "per-rate", taxAmount: "computed", nums: N(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
  { code: "M", prefix: "BR-AG", label: "IPSI", breakdownCount: "at-least-one", itemRate: "zero-or-positive", ids: "seller-any", exemption: "forbidden", taxableSum: "per-rate", taxAmount: "computed", nums: N(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
];

function hasIds(c: Ctx, req: IdRequirement): boolean {
  const inv = c.inv;
  switch (req) {
    case "seller-any":
      return has(sellerVat(inv)) || has(sellerTaxReg(inv)) || has(repVat(inv));
    case "seller-any-and-buyer":
      return (has(sellerVat(inv)) || has(sellerTaxReg(inv)) || has(repVat(inv))) && (has(buyerVat(inv)) || has(buyerLegalId(inv)));
    case "seller-vat-or-rep":
      return has(sellerVat(inv)) || has(repVat(inv));
    case "seller-vat-or-rep-and-buyer-vat":
      return (has(sellerVat(inv)) || has(repVat(inv))) && has(buyerVat(inv));
    case "none-allowed":
      return !has(sellerVat(inv)) && !has(repVat(inv)) && !has(buyerVat(inv));
  }
}

function idsText(spec: CategorySpec, kindLabel: string, bt: string): string {
  switch (spec.ids) {
    case "seller-any":
      return `An Invoice that contains ${kindLabel} where the VAT category code (${bt}) is "${spec.label}" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63).`;
    case "seller-any-and-buyer":
      return `An Invoice that contains ${kindLabel} where the VAT category code (${bt}) is "${spec.label}" shall contain the Seller VAT Identifier (BT-31), the Seller tax registration identifier (BT-32) and/or the Seller tax representative VAT identifier (BT-63) and the Buyer VAT identifier (BT-48) and/or the Buyer legal registration identifier (BT-47).`;
    case "seller-vat-or-rep":
      return `An Invoice that contains ${kindLabel} where the VAT category code (${bt}) is "${spec.label}" shall contain the Seller VAT Identifier (BT-31) or the Seller tax representative VAT identifier (BT-63).`;
    case "seller-vat-or-rep-and-buyer-vat":
      return `An Invoice that contains ${kindLabel} where the VAT category code (${bt}) is "${spec.label}" shall contain the Seller VAT Identifier (BT-31) or the Seller tax representative VAT identifier (BT-63) and the Buyer VAT identifier (BT-48).`;
    case "none-allowed":
      return `An Invoice that contains ${kindLabel} where the VAT category code (${bt}) is "${spec.label}" shall not contain the Seller VAT identifier (BT-31), the Seller tax representative VAT identifier (BT-63) or the Buyer VAT identifier (BT-48).`;
  }
}

export function vatCategoryRules(c: Ctx): void {
  const inv = c.inv;
  const items = categoryItems(inv);

  for (const spec of CATEGORIES) {
    const catItems = items.filter((it) => it.category === spec.code);
    const breakdowns = inv.vatBreakdowns
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.categoryCode === spec.code);
    const R = (n: string) => `${spec.prefix}-${n}`;

    // —— 01: breakdown presence when items use the category ——
    if (catItems.length > 0) {
      const wanted = spec.breakdownCount === "exactly-one" ? breakdowns.length === 1 : breakdowns.length >= 1;
      c.check(
        wanted,
        R(spec.nums.breakdown),
        `An Invoice that contains an Invoice line (BG-25), a Document level allowance (BG-20) or a Document level charge (BG-21) where the VAT category code (BT-151, BT-95 or BT-102) is "${spec.label}" shall contain in the VAT Breakdown (BG-23) ${spec.breakdownCount === "exactly-one" ? "exactly one" : "at least one"} VAT category code (BT-118) equal with "${spec.label}".`,
        { hint: breakdowns.length === 0 ? `Lines or allowances/charges use category ${spec.code} but there is no matching VAT breakdown (BG-23).` : `Expected exactly one ${spec.code} breakdown, found ${breakdowns.length}.` },
      );
    }

    // —— 02/03/04: identifier requirements ——
    const kinds: Array<["line" | "allowance" | "charge", string, string, string]> = [
      ["line", spec.nums.idsLine, "an Invoice line (BG-25)", "BT-151"],
      ["allowance", spec.nums.idsAllowance, "a Document level allowance (BG-20)", "BT-95"],
      ["charge", spec.nums.idsCharge, "a Document level charge (BG-21)", "BT-102"],
    ];
    for (const [kind, num, kindLabel, bt] of kinds) {
      if (catItems.some((it) => it.kind === kind)) {
        c.check(hasIds(c, spec.ids), R(num), idsText(spec, kindLabel, bt), {
          hint:
            spec.ids === "none-allowed"
              ? `Category O (not subject to VAT) forbids VAT identifiers on seller and buyer, but the invoice carries at least one.`
              : `Category ${spec.code} requires VAT/tax identifiers that are missing from the invoice.`,
        });
      }
    }

    // —— 05/06/07: item-level rate constraints ——
    const rateKinds: Array<["line" | "allowance" | "charge", string, string]> = [
      ["line", spec.nums.rateLine, "In an Invoice line (BG-25)"],
      ["allowance", spec.nums.rateAllowance, "In a Document level allowance (BG-20)"],
      ["charge", spec.nums.rateCharge, "In a Document level charge (BG-21)"],
    ];
    for (const [kind, num, where] of rateKinds) {
      for (const it of catItems.filter((x) => x.kind === kind)) {
        const rate = dec(it.rate);
        const loc = `${kind === "line" ? `invoice line ${inv.lines[it.index]?.id ?? it.index + 1}` : `document level ${kind} ${it.index + 1}`}`;
        switch (spec.itemRate) {
          case "zero":
            c.check(!!rate && rate.isZero(), R(num), `${where} where the VAT category code is "${spec.label}" the VAT rate shall be 0 (zero).`, {
              where: loc,
              hint: `Category ${spec.code} requires a VAT rate of exactly 0, found ${it.rate ?? "none"}.`,
            });
            break;
          case "positive":
            c.check(!!rate && rate.isPositive(), R(num), `${where} where the VAT category code is "${spec.label}" the VAT rate shall be greater than zero.`, {
              where: loc,
              hint: `Category S (standard rated) requires a VAT rate greater than 0, found ${it.rate ?? "none"}. Use category Z for zero-rated supplies.`,
            });
            break;
          case "zero-or-positive":
            c.check(!!rate && !rate.isNegative(), R(num), `${where} where the VAT category code is "${spec.label}" the VAT rate shall be 0 (zero) or greater than zero.`, { where: loc });
            break;
          case "absent":
            c.check(!has(it.rate), R(num), `${where} where the VAT category code is "${spec.label}" the VAT rate shall not be present.`, {
              where: loc,
              hint: "Category O (not subject to VAT) must not carry a VAT rate at all.",
            });
            break;
        }
      }
    }

    // —— 08: breakdown taxable amount ——
    for (const { b, i } of breakdowns) {
      const taxable = dec(b.taxableAmount);
      if (!taxable) continue;
      const where = breakdownWhere(b, i);
      if (spec.taxableSum === "exact") {
        const sum = r2(netSum(catItems));
        c.check(taxable.eq(sum), R(spec.nums.taxable), `In a VAT breakdown (BG-23) where the VAT category code (BT-118) is "${spec.label}" the VAT category taxable amount (BT-116) shall equal the sum of Invoice line net amounts (BT-131) minus the sum of Document level allowance amounts (BT-92) plus the sum of Document level charge amounts (BT-99) where the VAT category codes (BT-151, BT-95, BT-102) are "${spec.label}".`, {
          where,
          hint: `Taxable amount is ${taxable.toString()} but the ${spec.code}-categorized lines/allowances/charges add up to ${sum.toString()}.`,
        });
      } else {
        const rate = dec(b.rate);
        if (!rate) continue;
        const group = catItems.filter((it) => {
          const r = dec(it.rate);
          return !!r && r.eq(rate);
        });
        const sum = r2(netSum(group));
        c.check(withinOne(taxable, sum), R(spec.nums.taxable), `For each different value of VAT category rate (BT-119) where the VAT category code (BT-118) is "${spec.label}", the VAT category taxable amount (BT-116) in a VAT breakdown (BG-23) shall equal the sum of Invoice line net amounts (BT-131) plus the sum of document level charge amounts (BT-99) minus the sum of document level allowance amounts (BT-92) where the VAT category code is "${spec.label}" and the VAT rate equals the VAT category rate (BT-119).`, {
          where,
          hint: `Taxable amount is ${taxable.toString()} but the ${spec.code} items at rate ${rate.toString()}% add up to ${sum.toString()}.`,
        });
      }
    }

    // —— 09: breakdown tax amount ——
    for (const { b, i } of breakdowns) {
      const tax = dec(b.taxAmount);
      if (!tax) continue;
      const where = breakdownWhere(b, i);
      if (spec.taxAmount === "zero") {
        c.check(tax.isZero(), R(spec.nums.tax), `The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where the VAT category code (BT-118) is "${spec.label}" shall be 0 (zero).`, {
          where,
          hint: `Category ${spec.code} carries no VAT, so BT-117 must be 0, not ${tax.toString()}.`,
        });
      } else {
        const taxable = dec(b.taxableAmount);
        const rate = dec(b.rate);
        if (!taxable || !rate) continue;
        const expected = r2(taxable.abs().mul(rate.divPercent()));
        c.check(withinOne(tax.abs(), expected), R(spec.nums.tax), `The VAT category tax amount (BT-117) in a VAT breakdown (BG-23) where VAT category code (BT-118) is "${spec.label}" shall equal the VAT category taxable amount (BT-116) multiplied by the VAT category rate (BT-119).`, {
          where,
          hint: `BT-117 is ${tax.toString()} but ${taxable.toString()} × ${rate.toString()}% = ${expected.toString()}.`,
        });
      }
    }

    // —— 10: exemption reason ——
    for (const { b, i } of breakdowns) {
      const where = breakdownWhere(b, i);
      if (spec.exemption === "required") {
        c.check(has(b.exemptionReason) || has(b.exemptionReasonCode), R(spec.nums.exemption), `A VAT breakdown (BG-23) with VAT Category code (BT-118) "${spec.label}" shall have a VAT exemption reason code (BT-121) or a VAT exemption reason text (BT-120).`, {
          where,
          hint: `Category ${spec.code} requires an exemption reason (BT-120 text or BT-121 code) on the VAT breakdown.`,
        });
      } else if (spec.exemption === "forbidden") {
        c.check(!has(b.exemptionReason) && !has(b.exemptionReasonCode), R(spec.nums.exemption), `A VAT breakdown (BG-23) with VAT Category code (BT-118) "${spec.label}" shall not have a VAT exemption reason code (BT-121) or VAT exemption reason text (BT-120).`, { where });
      }
    }
  }

  // —— Intra-community extras: BR-IC-11, BR-IC-12 ——
  const hasIcBreakdown = inv.vatBreakdowns.some((b) => b.categoryCode === "K");
  if (hasIcBreakdown) {
    const periodFilled = !!inv.period && (has(inv.period.start) || has(inv.period.end));
    c.check(has(inv.delivery?.date) || periodFilled, "BR-IC-11", 'In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Intra-community supply" the Actual delivery date (BT-72) or the Invoicing period (BG-14) shall not be blank.', {
      hint: "Intra-community supplies must state when delivery happened: add BT-72 or an invoicing period (BG-14).",
    });
    c.check(has(inv.delivery?.address?.countryCode), "BR-IC-12", 'In an Invoice with a VAT breakdown (BG-23) where the VAT category code (BT-118) is "Intra-community supply" the Deliver to country code (BT-80) shall not be blank.', {
      hint: "Intra-community supplies must state the destination country: add a Deliver-to address (BG-15) with a country code (BT-80).",
    });
  }

  // —— Not-subject-to-VAT exclusivity: BR-O-11..14 ——
  const oBreakdowns = inv.vatBreakdowns.filter((b) => b.categoryCode === "O");
  if (oBreakdowns.length > 0) {
    c.check(inv.vatBreakdowns.length === oBreakdowns.length, "BR-O-11", 'An Invoice that contains a VAT breakdown group (BG-23) with a VAT category code (BT-118) "Not subject to VAT" shall not contain other VAT breakdown groups (BG-23).');
    c.check(inv.lines.every((l) => l.vat?.categoryCode === "O"), "BR-O-12", 'An Invoice that contains a VAT breakdown group (BG-23) with a VAT category code (BT-118) "Not subject to VAT" shall not contain an Invoice line (BG-25) where the Invoiced item VAT category code (BT-151) is not "Not subject to VAT".');
    c.check(inv.allowancesCharges.filter((a) => !a.isCharge).every((a) => a.vatCategory === "O"), "BR-O-13", 'An Invoice that contains a VAT breakdown group (BG-23) with a VAT category code (BT-118) "Not subject to VAT" shall not contain Document level allowances (BG-20) where Document level allowance VAT category code (BT-95) is not "Not subject to VAT".');
    c.check(inv.allowancesCharges.filter((a) => a.isCharge).every((a) => a.vatCategory === "O"), "BR-O-14", 'An Invoice that contains a VAT breakdown group (BG-23) with a VAT category code (BT-118) "Not subject to VAT" shall not contain Document level charges (BG-21) where Document level charge VAT category code (BT-102) is not "Not subject to VAT".');
  }

  // —— Split payment (Italy): BR-B-01, BR-B-02 ——
  const bItems = items.filter((it) => it.category === "B");
  if (bItems.length > 0) {
    c.check(
      inv.seller?.address?.countryCode === "IT" && inv.buyer?.address?.countryCode === "IT",
      "BR-B-01",
      'An Invoice where the VAT category code (BT-151, BT-95 or BT-102) is "Split payment" shall be a domestic Italian invoice.',
    );
    c.check(
      !items.some((it) => it.category === "S") && !inv.vatBreakdowns.some((b) => b.categoryCode === "S"),
      "BR-B-02",
      'An Invoice that contains a VAT category code "Split payment" shall not also contain the VAT category code "Standard rated".',
    );
  }

  // —— Exemption VAT rate consistency for AE (BR-AE-06/07 style) is covered by the
  //    parameterized rate rules above (itemRate: "zero").
}

/** Sum helper re-exported for tests. */
export function categoryNetSum(c: Ctx, code: string): Dec {
  return netSum(categoryItems(c.inv).filter((it) => it.category === code));
}
