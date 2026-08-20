/**
 * XRechnung national rules (BR-DE-*), implemented over the semantic model.
 *
 * Source of truth: the official KoSIT XRechnung Schematron
 * (itplr-kosit/xrechnung-schematron). Rule texts are the official German
 * texts; hints explain them in English. The pack runs automatically when the
 * invoice declares an XRechnung specification identifier (BT-24).
 *
 * Not covered (documented): BR-DEX-* (XRechnung extension profile) and
 * BR-DE-CVD-* (codelist value delivery checks).
 */

import { Ctx, has } from "./rules-util.js";
import { Invoice } from "./model.js";

/** True when BT-24 declares any XRechnung version. */
export function isXRechnung(inv: Invoice): boolean {
  const spec = inv.specificationId ?? "";
  return /xrechnung/i.test(spec) || /xoev-de:kosit/i.test(spec);
}

/** ISO 13616 IBAN check: format + mod-97. */
export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= "0" && ch <= "9" ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

const SKONTO_LINE = /^#(SKONTO)#TAGE=\d+#PROZENT=\d+\.\d{2}(#BASISBETRAG=-?\d+\.\d{2})?#$/;

export function xrechnungRules(c: Ctx): void {
  const inv = c.inv;
  const payment = inv.payment;

  c.check(!!payment, "BR-DE-1", 'Eine Rechnung (INVOICE) muss Angaben zu "PAYMENT INSTRUCTIONS" (BG-16) enthalten.', {
    hint: "XRechnung requires payment instructions (BG-16): at least a payment means type code (BT-81).",
  });
  c.check(!!inv.seller?.contact, "BR-DE-2", 'Die Gruppe "SELLER CONTACT" (BG-6) muss übermittelt werden.', {
    hint: "XRechnung requires a seller contact group with contact point, phone and e-mail (BT-41/42/43).",
  });
  c.check(has(inv.seller?.address?.city), "BR-DE-3", 'Das Element "Seller city" (BT-37) muss übermittelt werden.');
  c.check(has(inv.seller?.address?.postCode), "BR-DE-4", 'Das Element "Seller post code" (BT-38) muss übermittelt werden.');
  c.check(has(inv.seller?.contact?.name), "BR-DE-5", 'Das Element "Seller contact point" (BT-41) muss übermittelt werden.');
  c.check(has(inv.seller?.contact?.phone), "BR-DE-6", 'Das Element "Seller contact telephone number" (BT-42) muss übermittelt werden.');
  c.check(has(inv.seller?.contact?.email), "BR-DE-7", 'Das Element "Seller contact email address" (BT-43) muss übermittelt werden.');
  c.check(has(inv.buyer?.address?.city), "BR-DE-8", 'Das Element "Buyer city" (BT-52) muss übermittelt werden.');
  c.check(has(inv.buyer?.address?.postCode), "BR-DE-9", 'Das Element "Buyer post code" (BT-53) muss übermittelt werden.');
  if (inv.delivery?.hasAddress) {
    c.check(has(inv.delivery.address?.city), "BR-DE-10", 'Das Element "Deliver to city" (BT-77) muss übermittelt werden, wenn die Gruppe "DELIVER TO ADDRESS" (BG-15) übermittelt wird.');
    c.check(has(inv.delivery.address?.postCode), "BR-DE-11", 'Das Element "Deliver to post code" (BT-78) muss übermittelt werden, wenn die Gruppe "DELIVER TO ADDRESS" (BG-15) übermittelt wird.');
  }
  inv.vatBreakdowns.forEach((b, i) => {
    c.check(has(b.rate), "BR-DE-14", 'Das Element "VAT category rate" (BT-119) muss übermittelt werden.', {
      where: `VAT breakdown ${i + 1}`,
      hint: "XRechnung requires the VAT rate on every breakdown — including 0 for exempt categories (unlike core EN 16931, category O gets an explicit 0 here).",
    });
  });
  c.check(has(inv.buyerReference), "BR-DE-15", 'Das Element "Buyer reference" (BT-10) muss übermittelt werden.', {
    hint: "BT-10 carries the Leitweg-ID for German public-sector buyers. B2G invoices without it are rejected by the receiving platforms.",
  });

  const usedCategories = new Set(
    [
      ...inv.lines.map((l) => l.vat?.categoryCode),
      ...inv.allowancesCharges.map((ac) => ac.vatCategory),
    ].filter((x): x is string => !!x),
  );
  const needsSellerTaxId = ["S", "Z", "E", "AE", "K", "G", "L", "M"].some((cat) => usedCategories.has(cat));
  if (needsSellerTaxId) {
    c.check(
      has(inv.seller?.vatId) || has(inv.seller?.taxRegistrationId) || has(inv.taxRepresentative?.vatId),
      "BR-DE-16",
      'Wenn in einer Rechnung die Steuercodes S, Z, E, AE, K, G, L oder M verwendet werden, muss mindestens eines der Elemente "Seller VAT identifier" (BT-31), "Seller tax registration identifier" (BT-32) oder "SELLER TAX REPRESENTATIVE PARTY" (BG-11) übermittelt werden.',
    );
  }

  if (has(inv.typeCode)) {
    c.check(["326", "380", "381", "384", "389"].includes(inv.typeCode!), "BR-DE-17", 'Mit dem Element "Invoice type code" (BT-3) sollen ausschließlich folgende Codes aus der Codeliste UNTDID 1001 übermittelt werden: 326 (Partial invoice), 380 (Commercial invoice), 384 (Corrected invoice), 389 (Self-billed invoice), 381 (Credit note).', {
      severity: "warning",
      hint: `XRechnung restricts BT-3 to 326, 380, 381, 384, 389 — "${inv.typeCode}" is valid EN 16931 but outside the XRechnung subset.`,
    });
  }

  // BR-DE-18: structured cash-discount (Skonto) lines in payment terms.
  if (inv.paymentTerms && inv.paymentTerms.includes("#")) {
    const lines = inv.paymentTerms.split(/\r?\n/);
    const hashLines = lines.filter((l) => l.trim().startsWith("#"));
    c.check(
      hashLines.every((l) => SKONTO_LINE.test(l.trim().replace(/#\s*$/, "#"))),
      "BR-DE-18",
      "Die Informationen zur Gewährung von Skonto oder zur Berechnung von Verzugszinsen müssen wie folgt im Element \"Payment terms\" (BT-20) übermittelt werden: #SKONTO#TAGE=n#PROZENT=n.nn#[BASISBETRAG=n.nn#]",
      { hint: "Skonto lines must follow the exact pattern #SKONTO#TAGE=14#PROZENT=2.00# — each on its own line, percent with two decimals." },
    );
  }

  // BR-DE-19/20: IBAN plausibility for SEPA payment means.
  if (payment?.meansCode === "58") {
    for (const ct of payment.creditTransfers) {
      if (has(ct.accountId)) {
        c.check(isValidIban(ct.accountId!), "BR-DE-19", '"Payment account identifier" (BT-84) soll eine korrekte IBAN enthalten, wenn in "Payment means type code" (BT-81) mit dem Code 58 SEPA als Zahlungsmittel gefordert wird.', {
          severity: "warning",
          hint: `"${ct.accountId}" is not a valid IBAN (format or checksum). For non-IBAN accounts use payment means code 30.`,
        });
      }
    }
  }
  if (payment?.meansCode === "59" && has(payment.directDebit?.debitedAccount)) {
    c.check(isValidIban(payment.directDebit!.debitedAccount!), "BR-DE-20", '"Debited account identifier" (BT-91) soll eine korrekte IBAN enthalten, wenn in "Payment means type code" (BT-81) mit dem Code 59 SEPA als Zahlungsmittel gefordert wird.', {
      severity: "warning",
    });
  }

  c.check(
    /^urn:cen\.eu:en16931:2017#compliant#urn:(xeinkauf\.de|xoev-de):kosit:(standard:)?xrechnung_?[\d.]*/i.test(inv.specificationId ?? ""),
    "BR-DE-21",
    'Das Element "Specification identifier" (BT-24) soll syntaktisch der Kennung des Standards XRechnung entsprechen.',
    { severity: "warning", hint: "Use the full XRechnung customization id, e.g. urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0." },
  );

  // BR-DE-22: attachment filenames must be unique.
  const filenames = inv.supportingDocuments
    .map((d) => d.attachment?.filename)
    .filter((x): x is string => !!x);
  c.check(new Set(filenames).size === filenames.length, "BR-DE-22", 'Das "filename"-Attribut aller "EmbeddedDocumentBinaryObject"-Elemente muss eindeutig sein.', {
    hint: "Two attached documents share the same filename — receiving systems cannot store both.",
  });

  // BR-DE-23/24/25: payment means groups must match the means type code.
  if (payment) {
    const code = payment.meansCode;
    const hasTransfer = payment.creditTransfers.some((ct) => has(ct.accountId) || has(ct.accountName) || has(ct.providerId));
    const hasCard = !!payment.card;
    const hasDebit = has(payment.directDebit?.mandateId) || has(payment.directDebit?.debitedAccount);
    if (code === "30" || code === "58") {
      c.check(hasTransfer, "BR-DE-23-a", 'Wenn BT-81 "Payment means type code" einen Schlüssel für Überweisungen enthält (30, 58), muss BG-17 "CREDIT TRANSFER" übermittelt werden.', {
        hint: "Credit-transfer invoices must include the bank account (IBAN, BT-84).",
      });
      c.check(!hasCard && !hasDebit, "BR-DE-23-b", 'Wenn BT-81 "Payment means type code" einen Schlüssel für Überweisungen enthält (30, 58), dürfen BG-18 und BG-19 nicht übermittelt werden.');
    } else if (code === "48" || code === "54" || code === "55") {
      c.check(hasCard, "BR-DE-24-a", 'Wenn BT-81 "Payment means type code" einen Schlüssel für Kartenzahlungen enthält (48, 54, 55), muss BG-18 "PAYMENT CARD INFORMATION" übermittelt werden.');
      c.check(!hasTransfer && !hasDebit, "BR-DE-24-b", 'Wenn BT-81 "Payment means type code" einen Schlüssel für Kartenzahlungen enthält (48, 54, 55), dürfen BG-17 und BG-19 nicht übermittelt werden.');
    } else if (code === "59") {
      c.check(hasDebit, "BR-DE-25-a", 'Wenn BT-81 "Payment means type code" einen Schlüssel für Lastschriften enthält (59), muss BG-19 "DIRECT DEBIT" übermittelt werden.');
      c.check(!hasTransfer && !hasCard, "BR-DE-25-b", 'Wenn BT-81 "Payment means type code" einen Schlüssel für Lastschriften enthält (59), dürfen BG-17 und BG-18 nicht übermittelt werden.');
    }
  }

  if (inv.typeCode === "384") {
    c.check(inv.precedingInvoices.length >= 1, "BR-DE-26", 'Wenn im Element "Invoice type code" (BT-3) der Code 384 (Corrected invoice) übergeben wird, soll PRECEDING INVOICE REFERENCE BG-3 mind. einmal vorhanden sein.', {
      severity: "warning",
      hint: "A corrected invoice should reference the invoice it corrects (BG-3).",
    });
  }

  const phone = inv.seller?.contact?.phone;
  if (has(phone)) {
    c.check((phone!.match(/\d/g) ?? []).length >= 3, "BR-DE-27", "In BT-42 sollen mindestens drei Ziffern enthalten sein.", { severity: "warning" });
  }
  const email = inv.seller?.contact?.email;
  if (has(email)) {
    const e = email!;
    const at = e.indexOf("@");
    const ok =
      at > 1 &&
      e.lastIndexOf("@") === at &&
      e.length - at - 1 >= 2 &&
      !/[\s.]/.test(e[at - 1]!) &&
      !/[\s.]/.test(e[at + 1]!);
    c.check(ok, "BR-DE-28", "In BT-43 soll genau ein @-Zeichen enthalten sein, welches nicht von einem Leerzeichen oder einem Punkt flankiert wird; mindestens zwei Zeichen auf beiden Seiten.", { severity: "warning" });
  }

  const debitPresent = has(payment?.directDebit?.mandateId) || has(payment?.directDebit?.debitedAccount);
  if (debitPresent) {
    c.check(has(payment?.directDebit?.creditorId), "BR-DE-30", 'Wenn "DIRECT DEBIT" BG-19 vorhanden ist, dann muss "Bank assigned creditor identifier" BT-90 übermittelt werden.', {
      hint: "Direct-debit invoices need the SEPA creditor identifier (BT-90; UBL: seller PartyIdentification with schemeID=\"SEPA\").",
    });
    c.check(has(payment?.directDebit?.debitedAccount), "BR-DE-31", 'Wenn "DIRECT DEBIT" BG-19 vorhanden ist, dann muss "Debited account identifier" BT-91 übermittelt werden.');
  }
}
