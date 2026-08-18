/** Render a semantic-model invoice as plain text or standalone HTML. */

import { Dec } from "./decimal.js";
import { Amount, Invoice, Party } from "./model.js";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtAmount = (a: Amount | undefined, currency?: string): string => {
  if (!a) return "—";
  const d = Dec.parse(a.raw);
  const num = d ? d.toFixed2() : a.raw;
  return `${num} ${a.currency ?? currency ?? ""}`.trim();
};

const CATEGORY_LABELS: Record<string, string> = {
  S: "Standard rate",
  Z: "Zero rated",
  E: "Exempt",
  AE: "Reverse charge",
  K: "Intra-community supply",
  G: "Export outside the EU",
  O: "Not subject to VAT",
  L: "IGIC (Canary Islands)",
  M: "IPSI (Ceuta/Melilla)",
  B: "Split payment (IT)",
};

const TYPE_LABELS: Record<string, string> = {
  "380": "Commercial invoice",
  "381": "Credit note",
  "384": "Corrected invoice",
  "386": "Prepayment invoice",
  "389": "Self-billed invoice",
  "751": "Invoice information (DE)",
};

function partyLines(p: Party | undefined): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.name) out.push(p.name);
  if (p.tradingName && p.tradingName !== p.name) out.push(p.tradingName);
  const a = p.address;
  if (a) {
    if (a.line1) out.push(a.line1);
    if (a.line2) out.push(a.line2);
    const cityLine = [a.postCode, a.city].filter(Boolean).join(" ");
    if (cityLine) out.push(cityLine);
    if (a.countryCode) out.push(a.countryCode);
  }
  if (p.vatId) out.push(`VAT: ${p.vatId}`);
  if (p.legalRegistrationId) out.push(`Reg: ${p.legalRegistrationId.value}`);
  if (p.contact?.email) out.push(p.contact.email);
  return out;
}

/** Plain-text summary, suitable for terminals and agents. */
export function renderText(inv: Invoice): string {
  const cur = inv.currency;
  const L: string[] = [];
  const typeLabel = inv.typeCode ? (TYPE_LABELS[inv.typeCode] ?? `type ${inv.typeCode}`) : "invoice";
  L.push(`${typeLabel.toUpperCase()} ${inv.number ?? "(no number)"}`);
  L.push(`Issued: ${inv.issueDate ?? "—"}${inv.dueDate ? `   Due: ${inv.dueDate}` : ""}   Currency: ${cur ?? "—"}`);
  L.push("");
  const seller = partyLines(inv.seller);
  const buyer = partyLines(inv.buyer);
  L.push("From (seller):");
  for (const s of seller) L.push(`  ${s}`);
  L.push("To (buyer):");
  for (const s of buyer) L.push(`  ${s}`);
  if (inv.buyerReference) L.push(`Buyer reference: ${inv.buyerReference}`);
  if (inv.purchaseOrderReference) L.push(`Order reference: ${inv.purchaseOrderReference}`);
  L.push("");
  L.push("Lines:");
  inv.lines.forEach((l, i) => {
    const qty = l.quantity ? `${l.quantity} ${l.unitCode ?? ""}`.trim() : "";
    const price = l.price?.netPrice ? ` @ ${fmtAmount(l.price.netPrice, cur)}` : "";
    L.push(`  ${l.id ?? i + 1}. ${l.item?.name ?? "(unnamed item)"} — ${qty}${price} = ${fmtAmount(l.netAmount, cur)}`);
  });
  L.push("");
  for (const ac of inv.allowancesCharges) {
    L.push(`  ${ac.isCharge ? "Charge" : "Allowance"}: ${ac.reason ?? ac.reasonCode ?? ""} ${ac.isCharge ? "+" : "−"}${fmtAmount(ac.amount, cur)}`);
  }
  if (inv.vatBreakdowns.length) {
    L.push("VAT breakdown:");
    for (const b of inv.vatBreakdowns) {
      const cat = b.categoryCode ? (CATEGORY_LABELS[b.categoryCode] ?? b.categoryCode) : "—";
      L.push(`  ${cat}${b.rate ? ` ${b.rate}%` : ""}: base ${fmtAmount(b.taxableAmount, cur)} → VAT ${fmtAmount(b.taxAmount, cur)}`);
    }
  }
  L.push("Totals:");
  const t = inv.totals;
  L.push(`  Net (excl. VAT): ${fmtAmount(t.taxExclusive, cur)}`);
  L.push(`  VAT:             ${fmtAmount(t.vatTotal, cur)}`);
  L.push(`  Total (incl.):   ${fmtAmount(t.taxInclusive, cur)}`);
  if (t.paid) L.push(`  Paid:            ${fmtAmount(t.paid, cur)}`);
  L.push(`  Due:             ${fmtAmount(t.payable, cur)}`);
  if (inv.payment?.creditTransfers.some((ct) => ct.accountId)) {
    L.push("");
    L.push("Pay to:");
    for (const ct of inv.payment.creditTransfers) {
      if (ct.accountId) L.push(`  ${ct.accountId}${ct.providerId ? ` (${ct.providerId})` : ""}`);
    }
  }
  if (inv.paymentTerms) L.push(`Terms: ${inv.paymentTerms}`);
  for (const n of inv.notes) L.push(`Note: ${n.text}`);
  return L.join("\n");
}

/** Standalone HTML fragment (no scripts, no external resources). */
export function renderHtml(inv: Invoice): string {
  const cur = inv.currency;
  const typeLabel = inv.typeCode ? (TYPE_LABELS[inv.typeCode] ?? `Document type ${inv.typeCode}`) : "Invoice";
  const h: string[] = [];
  h.push(`<article class="einvoice">`);
  h.push(`<header><h2>${esc(typeLabel)} <strong>${esc(inv.number ?? "")}</strong></h2>`);
  h.push(`<p>Issued ${esc(inv.issueDate ?? "—")}${inv.dueDate ? ` · due ${esc(inv.dueDate)}` : ""}${inv.currency ? ` · ${esc(inv.currency)}` : ""}</p></header>`);
  h.push(`<section class="parties"><div><h3>Seller</h3><p>${partyLines(inv.seller).map(esc).join("<br>")}</p></div>`);
  h.push(`<div><h3>Buyer</h3><p>${partyLines(inv.buyer).map(esc).join("<br>")}</p></div></section>`);
  if (inv.buyerReference || inv.purchaseOrderReference) {
    h.push(`<p class="refs">${inv.buyerReference ? `Buyer ref: ${esc(inv.buyerReference)} ` : ""}${inv.purchaseOrderReference ? `Order: ${esc(inv.purchaseOrderReference)}` : ""}</p>`);
  }
  h.push(`<table class="lines"><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit price</th><th>VAT</th><th>Net</th></tr></thead><tbody>`);
  inv.lines.forEach((l, i) => {
    const qty = l.quantity ? `${l.quantity} ${l.unitCode ?? ""}`.trim() : "";
    const vat = l.vat ? `${l.vat.categoryCode ?? ""}${l.vat.rate ? ` ${l.vat.rate}%` : ""}` : "";
    h.push(
      `<tr><td>${esc(l.id ?? String(i + 1))}</td><td>${esc(l.item?.name ?? "")}${l.item?.description ? `<br><small>${esc(l.item.description)}</small>` : ""}</td><td>${esc(qty)}</td><td>${esc(fmtAmount(l.price?.netPrice, cur))}</td><td>${esc(vat)}</td><td class="num">${esc(fmtAmount(l.netAmount, cur))}</td></tr>`,
    );
  });
  h.push(`</tbody></table>`);
  if (inv.allowancesCharges.length) {
    h.push(`<ul class="acs">`);
    for (const ac of inv.allowancesCharges) {
      h.push(`<li>${ac.isCharge ? "Charge" : "Allowance"}${ac.reason ? ` (${esc(ac.reason)})` : ""}: ${ac.isCharge ? "+" : "−"}${esc(fmtAmount(ac.amount, cur))}</li>`);
    }
    h.push(`</ul>`);
  }
  if (inv.vatBreakdowns.length) {
    h.push(`<table class="vat"><thead><tr><th>VAT category</th><th>Rate</th><th>Base</th><th>VAT</th></tr></thead><tbody>`);
    for (const b of inv.vatBreakdowns) {
      const cat = b.categoryCode ? (CATEGORY_LABELS[b.categoryCode] ?? b.categoryCode) : "—";
      h.push(`<tr><td>${esc(cat)}</td><td>${esc(b.rate ? `${b.rate}%` : "—")}</td><td class="num">${esc(fmtAmount(b.taxableAmount, cur))}</td><td class="num">${esc(fmtAmount(b.taxAmount, cur))}</td></tr>`);
      if (b.exemptionReason || b.exemptionReasonCode) {
        h.push(`<tr><td colspan="4"><small>Exemption: ${esc(b.exemptionReason ?? b.exemptionReasonCode ?? "")}</small></td></tr>`);
      }
    }
    h.push(`</tbody></table>`);
  }
  const t = inv.totals;
  h.push(`<table class="totals"><tbody>`);
  const row = (label: string, a: Amount | undefined, strong = false) => {
    if (!a) return;
    const v = esc(fmtAmount(a, cur));
    h.push(`<tr><td>${esc(label)}</td><td class="num">${strong ? `<strong>${v}</strong>` : v}</td></tr>`);
  };
  row("Total lines (net)", t.lineTotal);
  row("Allowances", t.allowanceTotal);
  row("Charges", t.chargeTotal);
  row("Total excl. VAT", t.taxExclusive);
  row("VAT", t.vatTotal);
  row("Total incl. VAT", t.taxInclusive);
  row("Paid", t.paid);
  row("Rounding", t.rounding);
  row("Amount due", t.payable, true);
  h.push(`</tbody></table>`);
  const ibans = (inv.payment?.creditTransfers ?? []).filter((ct) => ct.accountId);
  if (ibans.length || inv.paymentTerms) {
    h.push(`<section class="payment"><h3>Payment</h3>`);
    if (ibans.length) h.push(`<p>${ibans.map((ct) => esc(`${ct.accountId}${ct.providerId ? ` (${ct.providerId})` : ""}`)).join("<br>")}</p>`);
    if (inv.paymentTerms) h.push(`<p>${esc(inv.paymentTerms)}</p>`);
    h.push(`</section>`);
  }
  if (inv.notes.length) {
    h.push(`<section class="notes">${inv.notes.map((n) => `<p>${esc(n.text)}</p>`).join("")}</section>`);
  }
  h.push(`</article>`);
  return h.join("\n");
}
