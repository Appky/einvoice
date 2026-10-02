/* Invoice creator: builds valid EN 16931 / XRechnung / Peppol UBL locally.
   No uploads, no account, no analytics. */
/* global EInvoice */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const DE = document.documentElement.lang === "de";
  const T = DE
    ? { valid: "Gültige Rechnung", invalid: "Noch nicht gültig", lineH: ["Bezeichnung", "Menge", "Einheit", "Einzelpreis", "USt %", ""], add: "+ Position", dl: "XML herunterladen", net: "Netto", vat: "USt.", gross: "Brutto", err: "Fehler" }
    : { valid: "Valid invoice", invalid: "Not valid yet", lineH: ["Item", "Qty", "Unit", "Unit price", "VAT %", ""], add: "+ Add line", dl: "Download XML", net: "Net", vat: "VAT", gross: "Total", err: "Problem" };

  const UNITS = [["C62", DE ? "Stück" : "piece"], ["HUR", DE ? "Stunde" : "hour"], ["DAY", DE ? "Tag" : "day"], ["KGM", "kg"], ["MTR", "m"], ["LTR", "l"], ["MON", DE ? "Monat" : "month"], ["KWH", "kWh"]];

  const linesEl = $("#lines tbody");

  function addLine(vals) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td><input class="l-name" placeholder="' + (DE ? "z. B. Beratung" : "e.g. Consulting") + '"></td>' +
      '<td><input class="l-qty" inputmode="decimal" value="1" size="4"></td>' +
      '<td><select class="l-unit">' + UNITS.map(([c, l]) => `<option value="${c}">${l}</option>`).join("") + "</select></td>" +
      '<td><input class="l-price" inputmode="decimal" placeholder="0.00" size="8"></td>' +
      '<td><input class="l-vat" inputmode="decimal" value="' + (DE ? "19" : "20") + '" size="4"></td>' +
      '<td><button type="button" class="l-del" aria-label="remove">×</button></td>';
    if (vals) {
      tr.querySelector(".l-name").value = vals.name || "";
      tr.querySelector(".l-qty").value = vals.quantity || "1";
      tr.querySelector(".l-unit").value = vals.unit || "C62";
      tr.querySelector(".l-price").value = vals.unitPrice || "";
      tr.querySelector(".l-vat").value = vals.vatRate != null ? vals.vatRate : "19";
    }
    tr.querySelector(".l-del").addEventListener("click", () => { tr.remove(); refresh(); });
    tr.addEventListener("input", refresh);
    linesEl.appendChild(tr);
  }

  function gather() {
    const v = (id) => ($(id) ? $(id).value.trim() : "");
    const profile = v("#f-profile") || "en16931";
    const input = {
      number: v("#f-number"),
      issueDate: v("#f-issue"),
      dueDate: v("#f-due") || undefined,
      typeCode: v("#f-type") || "380",
      currency: v("#f-currency") || "EUR",
      profile,
      buyerReference: v("#f-buyerref") || undefined,
      seller: {
        name: v("#s-name"), vatId: v("#s-vat") || undefined, registrationId: v("#s-reg") || undefined,
        street: v("#s-street") || undefined, city: v("#s-city") || undefined, postCode: v("#s-post") || undefined,
        countryCode: v("#s-country").toUpperCase(),
        contact: (v("#s-cname") || v("#s-cphone") || v("#s-cemail")) ? { name: v("#s-cname") || undefined, phone: v("#s-cphone") || undefined, email: v("#s-cemail") || undefined } : undefined,
        electronicAddress: v("#s-eas") && v("#s-easv") ? { scheme: v("#s-eas"), value: v("#s-easv") } : undefined,
      },
      buyer: {
        name: v("#b-name"), vatId: v("#b-vat") || undefined, registrationId: v("#b-reg") || undefined,
        street: v("#b-street") || undefined, city: v("#b-city") || undefined, postCode: v("#b-post") || undefined,
        countryCode: v("#b-country").toUpperCase(),
        electronicAddress: v("#b-eas") && v("#b-easv") ? { scheme: v("#b-eas"), value: v("#b-easv") } : undefined,
      },
      lines: [...linesEl.querySelectorAll("tr")].map((tr) => ({
        name: tr.querySelector(".l-name").value.trim(),
        quantity: tr.querySelector(".l-qty").value.trim() || "1",
        unit: tr.querySelector(".l-unit").value,
        unitPrice: tr.querySelector(".l-price").value.trim() || "0",
        vatRate: tr.querySelector(".l-vat").value.trim(),
      })).filter((l) => l.name !== "" || l.unitPrice !== "0"),
      iban: v("#f-iban") || undefined,
      bic: v("#f-bic") || undefined,
      paymentTerms: v("#f-terms") || undefined,
      note: v("#f-note") || undefined,
    };
    return input;
  }

  let currentXml = null;

  async function refresh() {
    const status = $("#status");
    const totals = $("#totals");
    const input = gather();
    try { localStorage.setItem("einvoice-draft", JSON.stringify(input)); } catch (e) { /* private mode */ }
    if (!input.number || !input.issueDate || !input.seller.name || !input.buyer.name || !input.lines.length) {
      status.className = "pill"; status.textContent = DE ? "Pflichtfelder ausfüllen…" : "Fill the required fields…";
      $("#download").disabled = true; totals.textContent = ""; return;
    }
    try {
      const xml = EInvoice.buildInvoice(input);
      const parsed = await EInvoice.parseInvoice(xml);
      const res = EInvoice.validate(parsed.invoice);
      if (res.ok) {
        currentXml = xml;
        status.className = "pill ok"; status.textContent = "✓ " + T.valid + " · " + (parsed.profile.name || "EN 16931");
        const t = parsed.invoice.totals;
        totals.textContent = `${T.net} ${t.taxExclusive?.raw} · ${T.vat} ${t.vatTotal?.raw} · ${T.gross} ${t.taxInclusive?.raw} ${input.currency}`;
        $("#download").disabled = false;
      } else {
        currentXml = null;
        status.className = "pill err"; status.textContent = T.invalid + " — " + res.findings[0].rule + ": " + (res.findings[0].hint || res.findings[0].text);
        $("#download").disabled = true; totals.textContent = "";
      }
    } catch (e) {
      currentXml = null;
      status.className = "pill err"; status.textContent = T.err + ": " + e.message;
      $("#download").disabled = true; totals.textContent = "";
    }
  }

  $("#download").addEventListener("click", () => {
    if (!currentXml) return;
    const input = gather();
    const blob = new Blob([currentXml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (input.number || "invoice").replace(/[^\w.-]+/g, "_") + ".xml";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#f-profile").addEventListener("change", () => {
    const p = $("#f-profile").value;
    document.body.dataset.profile = p;
    refresh();
  });
  document.querySelectorAll("input, select, textarea").forEach((el) => el.addEventListener("input", refresh));
  $("#add-line").addEventListener("click", () => { addLine(); refresh(); });

  // Restore draft or start fresh.
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem("einvoice-draft") || "null"); } catch (e) { /* ignore */ }
  if (draft && draft.lines && draft.lines.length) {
    const set = (id, val) => { if ($(id) && val != null) $(id).value = val; };
    set("#f-number", draft.number); set("#f-issue", draft.issueDate); set("#f-due", draft.dueDate);
    set("#f-currency", draft.currency); set("#f-profile", draft.profile); set("#f-buyerref", draft.buyerReference);
    set("#f-iban", draft.iban); set("#f-bic", draft.bic); set("#f-terms", draft.paymentTerms); set("#f-note", draft.note);
    const party = (prefix, p) => { if (!p) return; set(prefix + "-name", p.name); set(prefix + "-vat", p.vatId); set(prefix + "-reg", p.registrationId); set(prefix + "-street", p.street); set(prefix + "-city", p.city); set(prefix + "-post", p.postCode); set(prefix + "-country", p.countryCode); if (p.electronicAddress) { set(prefix + "-eas", p.electronicAddress.scheme); set(prefix + "-easv", p.electronicAddress.value); } };
    party("#s", draft.seller); party("#b", draft.buyer);
    if (draft.seller && draft.seller.contact) { set("#s-cname", draft.seller.contact.name); set("#s-cphone", draft.seller.contact.phone); set("#s-cemail", draft.seller.contact.email); }
    draft.lines.forEach((l) => addLine(l));
    document.body.dataset.profile = draft.profile || "en16931";
  } else {
    $("#f-issue").value = new Date().toISOString().slice(0, 10);
    addLine();
  }
  refresh();
})();
