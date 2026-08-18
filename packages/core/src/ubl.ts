/**
 * UBL 2.1 Invoice / CreditNote → EN 16931 semantic model.
 *
 * Element paths follow the official EN 16931 UBL syntax binding
 * (CEN/TS 16931-3-2), cross-checked against the ConnectingEurope
 * validation artefacts.
 */

import { XmlElement } from "./xml.js";
import {
  AllowanceCharge,
  Amount,
  Contact,
  Delivery,
  Id,
  Invoice,
  InvoiceLine,
  Item,
  Party,
  PaymentInstructions,
  Period,
  PostalAddress,
  Price,
  SupportingDocument,
  VatBreakdown,
  emptyInvoice,
} from "./model.js";

export const NS_UBL_INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
export const NS_UBL_CREDITNOTE = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";
const CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
const CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";

const t = (el: XmlElement | undefined, name: string): string | undefined => {
  const v = el?.get(CBC, name)?.text;
  return v === undefined || v === "" ? undefined : v;
};

const amount = (el: XmlElement | undefined): Amount | undefined => {
  if (!el || el.text === "") return undefined;
  return { raw: el.text, currency: el.attr("currencyID") };
};

const idOf = (el: XmlElement | undefined): Id | undefined => {
  if (!el || el.text === "") return undefined;
  return { value: el.text, scheme: el.attr("schemeID"), schemeVersion: el.attr("schemeVersionID") };
};

function mapAddress(el: XmlElement | undefined): PostalAddress | undefined {
  if (!el) return undefined;
  const addr: PostalAddress = {
    line1: t(el, "StreetName"),
    line2: t(el, "AdditionalStreetName"),
    line3: el.all(CAC, "AddressLine").map((l) => t(l, "Line")).find((x) => x !== undefined),
    city: t(el, "CityName"),
    postCode: t(el, "PostalZone"),
    subdivision: t(el, "CountrySubentity"),
    countryCode: t(el.get(CAC, "Country"), "IdentificationCode"),
  };
  return addr;
}

function mapContact(el: XmlElement | undefined): Contact | undefined {
  if (!el) return undefined;
  return { name: t(el, "Name"), phone: t(el, "Telephone"), email: t(el, "ElectronicMail") };
}

function mapParty(partyEl: XmlElement | undefined): Party | undefined {
  if (!partyEl) return undefined;
  const legal = partyEl.get(CAC, "PartyLegalEntity");
  const party: Party = {
    name: t(legal, "RegistrationName"),
    tradingName: t(partyEl.get(CAC, "PartyName"), "Name"),
    identifiers: partyEl
      .all(CAC, "PartyIdentification")
      .map((p) => idOf(p.get(CBC, "ID")))
      .filter((x): x is Id => !!x),
    legalRegistrationId: idOf(legal?.get(CBC, "CompanyID")),
    legalInfo: t(legal, "CompanyLegalForm"),
    electronicAddress: idOf(partyEl.get(CBC, "EndpointID")),
    address: mapAddress(partyEl.get(CAC, "PostalAddress")),
    contact: mapContact(partyEl.get(CAC, "Contact")),
  };
  for (const pts of partyEl.all(CAC, "PartyTaxScheme")) {
    const scheme = t(pts.get(CAC, "TaxScheme"), "ID");
    const companyId = t(pts, "CompanyID");
    if (scheme === "VAT") party.vatId = companyId;
    else party.taxRegistrationId = companyId;
  }
  return party;
}

function mapPayeeParty(partyEl: XmlElement | undefined): Party | undefined {
  if (!partyEl) return undefined;
  // BG-10: name comes from PartyName (BT-59), not PartyLegalEntity.
  const party: Party = {
    name: t(partyEl.get(CAC, "PartyName"), "Name"),
    identifiers: partyEl
      .all(CAC, "PartyIdentification")
      .map((p) => idOf(p.get(CBC, "ID")))
      .filter((x): x is Id => !!x),
    legalRegistrationId: idOf(partyEl.get(CAC, "PartyLegalEntity")?.get(CBC, "CompanyID")),
  };
  return party;
}

function mapTaxRepresentative(partyEl: XmlElement | undefined): Party | undefined {
  if (!partyEl) return undefined;
  const party: Party = {
    name: t(partyEl.get(CAC, "PartyName"), "Name"),
    identifiers: [],
    address: mapAddress(partyEl.get(CAC, "PostalAddress")),
  };
  for (const pts of partyEl.all(CAC, "PartyTaxScheme")) {
    if (t(pts.get(CAC, "TaxScheme"), "ID") === "VAT") party.vatId = t(pts, "CompanyID");
  }
  return party;
}

function mapPeriod(el: XmlElement | undefined): Period | undefined {
  if (!el) return undefined;
  const p: Period = { start: t(el, "StartDate"), end: t(el, "EndDate") };
  if (p.start === undefined && p.end === undefined) return { };
  return p;
}

function mapAllowanceCharge(el: XmlElement, documentLevel: boolean): AllowanceCharge {
  const cat = el.get(CAC, "TaxCategory");
  const ac: AllowanceCharge = {
    isCharge: t(el, "ChargeIndicator") === "true",
    amount: amount(el.get(CBC, "Amount")),
    baseAmount: amount(el.get(CBC, "BaseAmount")),
    percentage: t(el, "MultiplierFactorNumeric"),
    reason: t(el, "AllowanceChargeReason"),
    reasonCode: t(el, "AllowanceChargeReasonCode"),
  };
  if (documentLevel) {
    ac.vatCategory = t(cat, "ID");
    ac.vatRate = t(cat, "Percent");
  }
  return ac;
}

function mapPrice(el: XmlElement | undefined): Price | undefined {
  if (!el) return undefined;
  const discountAc = el
    .all(CAC, "AllowanceCharge")
    .find((a) => t(a, "ChargeIndicator") === "false");
  const bq = el.get(CBC, "BaseQuantity");
  return {
    netPrice: amount(el.get(CBC, "PriceAmount")),
    discount: amount(discountAc?.get(CBC, "Amount")),
    grossPrice: amount(discountAc?.get(CBC, "BaseAmount")),
    baseQuantity: bq?.text || undefined,
    baseQuantityUnit: bq?.attr("unitCode"),
  };
}

function mapItem(el: XmlElement | undefined): Item | undefined {
  if (!el) return undefined;
  return {
    name: t(el, "Name"),
    description: t(el, "Description"),
    sellerId: t(el.get(CAC, "SellersItemIdentification"), "ID"),
    buyerId: t(el.get(CAC, "BuyersItemIdentification"), "ID"),
    standardId: idOf(el.get(CAC, "StandardItemIdentification")?.get(CBC, "ID")),
    classificationIds: el
      .all(CAC, "CommodityClassification")
      .flatMap((c) => c.all(CBC, "ItemClassificationCode"))
      .map((c) => ({ value: c.text, scheme: c.attr("listID"), schemeVersion: c.attr("listVersionID") })),
    originCountry: t(el.get(CAC, "OriginCountry"), "IdentificationCode"),
    attributes: el.all(CAC, "AdditionalItemProperty").map((p) => ({ name: t(p, "Name"), value: t(p, "Value") })),
  };
}

function mapLine(el: XmlElement, creditNote: boolean): InvoiceLine {
  const qtyEl = el.get(CBC, creditNote ? "CreditedQuantity" : "InvoicedQuantity");
  const item = el.get(CAC, "Item");
  const taxCat = item?.get(CAC, "ClassifiedTaxCategory");
  const objRef = el
    .all(CAC, "DocumentReference")
    .find((d) => t(d, "DocumentTypeCode") === "130");
  const line: InvoiceLine = {
    id: t(el, "ID"),
    note: t(el, "Note"),
    objectId: idOf(objRef?.get(CBC, "ID")),
    quantity: qtyEl?.text || undefined,
    unitCode: qtyEl?.attr("unitCode"),
    netAmount: amount(el.get(CBC, "LineExtensionAmount")),
    orderLineRef: t(el.get(CAC, "OrderLineReference"), "LineID"),
    accountingRef: t(el, "AccountingCost"),
    period: mapPeriod(el.get(CAC, "InvoicePeriod")),
    allowancesCharges: el.all(CAC, "AllowanceCharge").map((a) => mapAllowanceCharge(a, false)),
    price: mapPrice(el.get(CAC, "Price")),
    vat: taxCat ? { categoryCode: t(taxCat, "ID"), rate: t(taxCat, "Percent") } : undefined,
    item: mapItem(item),
  };
  return line;
}

function mapPayment(root: XmlElement): PaymentInstructions | undefined {
  const meansEls = root.all(CAC, "PaymentMeans");
  const termsNotes = root
    .all(CAC, "PaymentTerms")
    .map((pt) => t(pt, "Note"))
    .filter((x): x is string => !!x);
  if (meansEls.length === 0) return undefined;
  const first = meansEls[0]!;
  const code = first.get(CBC, "PaymentMeansCode");
  const card = first.get(CAC, "CardAccount");
  const mandate = first.get(CAC, "PaymentMandate");
  const payment: PaymentInstructions = {
    meansCode: code?.text || undefined,
    meansText: code?.attr("name"),
    remittanceInfo: t(first, "PaymentID"),
    creditTransfers: meansEls
      .map((m) => m.get(CAC, "PayeeFinancialAccount"))
      .filter((x): x is XmlElement => !!x)
      .map((acc) => ({
        accountId: t(acc, "ID"),
        accountName: t(acc, "Name"),
        providerId: t(acc.get(CAC, "FinancialInstitutionBranch"), "ID"),
      })),
    card: card ? { pan: t(card, "PrimaryAccountNumberID"), holder: t(card, "HolderName") } : undefined,
    directDebit: mandate
      ? { mandateId: t(mandate, "ID"), debitedAccount: t(mandate.get(CAC, "PayerFinancialAccount"), "ID") }
      : undefined,
  };
  void termsNotes;
  return payment;
}

function mapSupportingDocuments(root: XmlElement): { docs: SupportingDocument[]; objectId?: Id } {
  const docs: SupportingDocument[] = [];
  let objectId: Id | undefined;
  for (const ref of root.all(CAC, "AdditionalDocumentReference")) {
    const typeCode = t(ref, "DocumentTypeCode");
    if (typeCode === "130" && !objectId) {
      objectId = idOf(ref.get(CBC, "ID"));
      continue;
    }
    const attachment = ref.get(CAC, "Attachment");
    const embedded = attachment?.get(CBC, "EmbeddedDocumentBinaryObject");
    docs.push({
      reference: t(ref, "ID"),
      description: t(ref, "DocumentDescription"),
      url: t(attachment?.get(CAC, "ExternalReference"), "URI"),
      attachment: embedded
        ? { mimeCode: embedded.attr("mimeCode"), filename: embedded.attr("filename"), present: true }
        : undefined,
    });
  }
  return { docs, objectId };
}

/** Map a parsed UBL Invoice or CreditNote document to the semantic model. */
export function mapUbl(root: XmlElement): Invoice {
  const creditNote = root.ns === NS_UBL_CREDITNOTE;
  const inv = emptyInvoice(creditNote ? "ubl-creditnote" : "ubl-invoice");

  inv.specificationId = t(root, "CustomizationID");
  inv.businessProcess = t(root, "ProfileID");
  inv.number = t(root, "ID");
  inv.issueDate = t(root, "IssueDate");
  inv.typeCode = t(root, creditNote ? "CreditNoteTypeCode" : "InvoiceTypeCode");
  inv.currency = t(root, "DocumentCurrencyCode");
  inv.vatCurrency = t(root, "TaxCurrencyCode");
  inv.taxPointDate = t(root, "TaxPointDate");
  inv.buyerReference = t(root, "BuyerReference");
  inv.accountingRef = t(root, "AccountingCost");

  inv.dueDate = t(root, "DueDate") ?? root.all(CAC, "PaymentMeans").map((m) => t(m, "PaymentDueDate")).find((x) => x);

  const invoicePeriod = root.get(CAC, "InvoicePeriod");
  inv.period = mapPeriod(invoicePeriod);
  inv.taxPointDateCode = t(invoicePeriod, "DescriptionCode");

  const order = root.get(CAC, "OrderReference");
  inv.purchaseOrderReference = t(order, "ID");
  inv.salesOrderReference = t(order, "SalesOrderID");
  inv.contractReference = t(root.get(CAC, "ContractDocumentReference"), "ID");
  inv.receivingAdviceReference = t(root.get(CAC, "ReceiptDocumentReference"), "ID");
  inv.despatchAdviceReference = t(root.get(CAC, "DespatchDocumentReference"), "ID");
  inv.tenderReference = t(root.get(CAC, "OriginatorDocumentReference"), "ID");
  inv.projectReference = t(root.get(CAC, "ProjectReference"), "ID");
  inv.paymentTerms = root
    .all(CAC, "PaymentTerms")
    .map((pt) => t(pt, "Note"))
    .filter((x): x is string => !!x)
    .join("\n") || undefined;

  for (const note of root.all(CBC, "Note")) {
    const m = /^#([A-Z]{3})#([\s\S]*)$/.exec(note.text);
    if (m) inv.notes.push({ subjectCode: m[1], text: m[2] ?? "" });
    else inv.notes.push({ text: note.text });
  }

  for (const billing of root.all(CAC, "BillingReference")) {
    const ref = billing.get(CAC, "InvoiceDocumentReference");
    if (ref) inv.precedingInvoices.push({ reference: t(ref, "ID"), issueDate: t(ref, "IssueDate") });
  }

  inv.seller = mapParty(root.get(CAC, "AccountingSupplierParty")?.get(CAC, "Party"));
  inv.buyer = mapParty(root.get(CAC, "AccountingCustomerParty")?.get(CAC, "Party"));
  inv.payee = mapPayeeParty(root.get(CAC, "PayeeParty"));
  inv.taxRepresentative = mapTaxRepresentative(root.get(CAC, "TaxRepresentativeParty"));

  const deliveryEl = root.get(CAC, "Delivery");
  if (deliveryEl) {
    const location = deliveryEl.get(CAC, "DeliveryLocation");
    const address = mapAddress(location?.get(CAC, "Address"));
    const delivery: Delivery = {
      partyName: t(deliveryEl.get(CAC, "DeliveryParty")?.get(CAC, "PartyName"), "Name"),
      locationId: idOf(location?.get(CBC, "ID")),
      date: t(deliveryEl, "ActualDeliveryDate"),
      address,
      hasAddress: !!location?.get(CAC, "Address"),
    };
    inv.delivery = delivery;
  }

  inv.payment = mapPayment(root);
  inv.allowancesCharges = root.all(CAC, "AllowanceCharge").map((a) => mapAllowanceCharge(a, true));

  const totalsEl = root.get(CAC, "LegalMonetaryTotal");
  if (totalsEl) {
    inv.totals = {
      lineTotal: amount(totalsEl.get(CBC, "LineExtensionAmount")),
      allowanceTotal: amount(totalsEl.get(CBC, "AllowanceTotalAmount")),
      chargeTotal: amount(totalsEl.get(CBC, "ChargeTotalAmount")),
      taxExclusive: amount(totalsEl.get(CBC, "TaxExclusiveAmount")),
      taxInclusive: amount(totalsEl.get(CBC, "TaxInclusiveAmount")),
      paid: amount(totalsEl.get(CBC, "PrepaidAmount")),
      rounding: amount(totalsEl.get(CBC, "PayableRoundingAmount")),
      payable: amount(totalsEl.get(CBC, "PayableAmount")),
    };
  }

  for (const taxTotal of root.all(CAC, "TaxTotal")) {
    const amt = amount(taxTotal.get(CBC, "TaxAmount"));
    if (amt) {
      if (inv.vatCurrency && amt.currency === inv.vatCurrency && inv.currency !== inv.vatCurrency) {
        inv.totals.vatTotalAccounting = amt;
      } else if (!inv.totals.vatTotal) {
        inv.totals.vatTotal = amt;
      }
    }
    for (const sub of taxTotal.all(CAC, "TaxSubtotal")) {
      const cat = sub.get(CAC, "TaxCategory");
      const breakdown: VatBreakdown = {
        taxableAmount: amount(sub.get(CBC, "TaxableAmount")),
        taxAmount: amount(sub.get(CBC, "TaxAmount")),
        categoryCode: t(cat, "ID"),
        rate: t(cat, "Percent"),
        exemptionReason: t(cat, "TaxExemptionReason"),
        exemptionReasonCode: t(cat, "TaxExemptionReasonCode"),
      };
      inv.vatBreakdowns.push(breakdown);
    }
  }

  const { docs, objectId } = mapSupportingDocuments(root);
  inv.supportingDocuments = docs;
  inv.objectId = objectId;

  inv.lines = root
    .all(CAC, creditNote ? "CreditNoteLine" : "InvoiceLine")
    .map((l) => mapLine(l, creditNote));

  return inv;
}
