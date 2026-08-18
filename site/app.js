/* Playground: everything runs in this tab. No uploads, no analytics, no requests. */
/* global EInvoice */
(function () {
  "use strict";
  const $ = (sel) => document.querySelector(sel);
  const drop = $("#drop");
  const fileInput = $("#file");
  const result = $("#result");

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  async function handle(bytes, name) {
    result.innerHTML = "";
    let parsed;
    try {
      parsed = await EInvoice.parseInvoice(bytes);
    } catch (e) {
      result.appendChild(el("div", { class: "verdict" }, [
        el("span", { class: "pill err", text: "Cannot read file" }),
        el("span", { class: "meta", text: name || "" }),
      ]));
      result.appendChild(el("p", { text: e.message }));
      result.appendChild(el("p", { class: "meta", text: "Supported: UBL 2.1 Invoice/CreditNote XML, UN/CEFACT CII XML, Factur-X or ZUGFeRD hybrid PDF (XRechnung and Peppol BIS use these syntaxes)." }));
      return;
    }
    const res = EInvoice.validate(parsed.invoice);
    const label = parsed.profile.name || (parsed.profile.specificationId ? "unrecognized profile" : "no profile");
    const verdict = el("div", { class: "verdict" }, [
      el("span", { class: "pill " + (res.ok ? "ok" : "err"), text: res.ok ? "Valid" : "Invalid" }),
      el("span", { class: "meta", text: (name ? name + " — " : "") + parsed.format + " · " + label + " · " + res.errors + " error(s), " + res.warnings + " warning(s)" }),
    ]);
    result.appendChild(verdict);

    if (res.findings.length) {
      const ul = el("ul", { class: "findings" });
      for (const f of res.findings) {
        const li = el("li", { class: f.severity === "fatal" ? "" : "warn" });
        li.appendChild(el("div", { class: "rule", text: f.rule + (f.where ? " · " + f.where : "") }));
        li.appendChild(el("div", { text: f.hint || f.text }));
        if (f.hint) {
          const det = el("details", { class: "official" });
          det.appendChild(el("summary", { text: "Official rule text" }));
          det.appendChild(el("p", { text: f.text }));
          li.appendChild(det);
        }
        ul.appendChild(li);
      }
      result.appendChild(ul);
    } else {
      result.appendChild(el("p", { class: "meta", text: "All implemented EN 16931 business rules are satisfied." }));
    }

    const rendered = document.createElement("div");
    rendered.innerHTML = EInvoice.renderHtml(parsed.invoice);
    result.appendChild(rendered);
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleFile(file) {
    const buf = await file.arrayBuffer();
    await handle(new Uint8Array(buf), file.name);
  }

  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("hover"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("hover"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("hover");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });
  document.addEventListener("paste", (e) => {
    const text = e.clipboardData && e.clipboardData.getData("text");
    if (text && text.trimStart().startsWith("<")) handle(text, "pasted XML");
  });
  $("#try-sample").addEventListener("click", async () => {
    const resp = await fetch("sample-invoice.xml");
    await handle(await resp.text(), "sample-invoice.xml");
  });
})();
