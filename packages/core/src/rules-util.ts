/** Shared helpers for the rule implementations. */

import { Dec } from "./decimal.js";
import { AllowanceCharge, Amount, Invoice, InvoiceLine, VatBreakdown } from "./model.js";

export type Severity = "fatal" | "warning";

export interface Finding {
  /** Official rule identifier, e.g. "BR-CO-15". */
  rule: string;
  severity: Severity;
  /** The official rule text (as published in the EN 16931 validation artefacts). */
  text: string;
  /** Plain-language explanation of what is wrong in this document, when available. */
  hint?: string;
  /** Human-readable location, e.g. "invoice line 3" or "VAT breakdown 2 (category S, rate 21%)". */
  where?: string;
}

export interface ValidationResult {
  /** True when no fatal findings were raised. */
  ok: boolean;
  errors: number;
  warnings: number;
  findings: Finding[];
  /** Identifiers of all rules that were evaluated. */
  rulesApplied: number;
}

export class Ctx {
  findings: Finding[] = [];
  constructor(readonly inv: Invoice) {}

  fail(rule: string, text: string, opts?: { hint?: string; where?: string; severity?: Severity }): void {
    this.findings.push({
      rule,
      severity: opts?.severity ?? "fatal",
      text,
      hint: opts?.hint,
      where: opts?.where,
    });
  }

  /** assert: raise a finding when `condition` is false. */
  check(condition: boolean, rule: string, text: string, opts?: { hint?: string; where?: string; severity?: Severity }): void {
    if (!condition) this.fail(rule, text, opts);
  }
}

export const dec = (a: Amount | string | undefined): Dec | undefined =>
  a === undefined ? undefined : Dec.parse(typeof a === "string" ? a : a.raw);

export const decOrZero = (a: Amount | string | undefined): Dec => dec(a) ?? Dec.ZERO;

/** Present = element exists with non-empty content. */
export const has = (v: unknown): boolean => v !== undefined && v !== "" && v !== null;

/** Round to 2 decimals, XPath fn:round semantics. */
export const r2 = (d: Dec): Dec => d.round(2);

/** |a - b| < 1.00 — the official ±1 currency-unit tolerance used by BR-CO-17 / *-09 / *-08 rate rules. */
export const withinOne = (a: Dec, b: Dec): boolean => a.sub(b).abs().cmp(Dec.parse("1")!) < 0;

export interface CategoryItem {
  kind: "line" | "allowance" | "charge";
  index: number;
  category?: string;
  rate?: string;
  amount?: Amount;
}

/** All VAT-categorized items: lines, document allowances, document charges. */
export function categoryItems(inv: Invoice): CategoryItem[] {
  const items: CategoryItem[] = inv.lines.map((l, i) => ({
    kind: "line" as const,
    index: i,
    category: l.vat?.categoryCode,
    rate: l.vat?.rate,
    amount: l.netAmount,
  }));
  inv.allowancesCharges.forEach((ac, i) => {
    items.push({
      kind: ac.isCharge ? "charge" : "allowance",
      index: i,
      category: ac.vatCategory,
      rate: ac.vatRate,
      amount: ac.amount,
    });
  });
  return items;
}

/** Σ lines − Σ allowances + Σ charges over the given items. */
export function netSum(items: CategoryItem[]): Dec {
  let sum = Dec.ZERO;
  for (const it of items) {
    const amt = dec(it.amount);
    if (!amt) continue;
    sum = it.kind === "allowance" ? sum.sub(amt) : sum.add(amt);
  }
  return sum;
}

export const sellerVat = (inv: Invoice): string | undefined => inv.seller?.vatId;
export const sellerTaxReg = (inv: Invoice): string | undefined => inv.seller?.taxRegistrationId;
export const repVat = (inv: Invoice): string | undefined => inv.taxRepresentative?.vatId;
export const buyerVat = (inv: Invoice): string | undefined => inv.buyer?.vatId;
export const buyerLegalId = (inv: Invoice): string | undefined => inv.buyer?.legalRegistrationId?.value;

export function breakdownWhere(b: VatBreakdown, i: number): string {
  const bits = [`VAT breakdown ${i + 1}`];
  if (b.categoryCode) bits.push(`category ${b.categoryCode}`);
  if (b.rate) bits.push(`rate ${b.rate}%`);
  return bits.join(", ");
}

export function lineWhere(l: InvoiceLine, i: number): string {
  return `invoice line ${l.id ?? i + 1}`;
}

export function acWhere(ac: AllowanceCharge, i: number): string {
  return `document level ${ac.isCharge ? "charge" : "allowance"} ${i + 1}`;
}

/** ISO-8601 date check (YYYY-MM-DD). */
export const isIsoDate = (s: string | undefined): boolean => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
