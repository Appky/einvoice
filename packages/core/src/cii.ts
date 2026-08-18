/**
 * UN/CEFACT Cross-Industry Invoice (CII, D16B) → EN 16931 semantic model.
 *
 * Element paths follow the official EN 16931 CII syntax binding
 * (CEN/TS 16931-3-3), cross-checked against the ConnectingEurope
 * validation artefacts. This is also the XML syntax embedded in
 * Factur-X / ZUGFeRD hybrid PDFs.
 */

import { XmlElement } from "./xml.js";
import {
  AllowanceCharge,
  Amount,
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

export const NS_CII = "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100";
const RAM = "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100";
const UDT = "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100";

const t = (el: XmlElement | undefined, name: string): string | undefined => {
  const v = el?.get(RAM, name)?.text;
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

/** CII dates use udt:DateTimeString format="102" → YYYYMMDD. Normalize to YYYY-MM-DD. */
function dateOf(el: XmlElement | undefined): string | undefined {
  if (!el) return undefined;
  const dts = el.get(UDT, "DateTimeString") ?? el.get(UDT, "DateString") ?? el.get(QDT, "FormattedDateTimeString");
  const raw = (dts ?? el).text;
  if (!raw) return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return raw;
}

const QDT = "urn:un:unece:uncefact:data:standard:QualifiedDataType:100";

function mapAddress(el: XmlElement | undefined): PostalAddress | undefined {
  if (!el) return undefined;
  return {
    line1: t(el, "LineOne"),
    line2: t(el, "LineTwo"),
    line3: t(el, "LineThree"),
    city: t(el, "CityName"),
    postCode: t(el, "PostcodeCode"),
    subdivision: t(el, "CountrySubDivisionName"),
    countryCode: t(el, "CountryID"),
  };
}

function mapParty(el: XmlElement | undefined, role: "seller" | "buyer" | "payee" | "taxrep"): Party | undefined {
  if (!el) return undefined;
  const legal = el.get(RAM, "SpecifiedLegalOrganization");
  const contact = el.get(RAM, "DefinedTradeContact");
  const party: Party = {
    name: t(el, "Name"),
    tradingName: t(legal, "TradingBusinessName"),
    identifiers: [
      ...el.all(RAM, "ID").map((i) => idOf(i)).filter((x): x is Id => !!x),
      ...el.all(RAM, "GlobalID").map((i) => idOf(i)).filter((x): x is Id => !!x),
    ],
    legalRegistrationId: idOf(legal?.get(RAM, "ID")),
    electronicAddress: idOf(el.get(RAM, "URIUniversalCommunication")?.get(RAM, "URIID")),
    address: mapAddress(el.get(RAM, "PostalTradeAddress")),
    contact: contact
      ? {
          name: t(contact, "PersonName") ?? t(contact, "DepartmentName"),
          phone: t(contact.get(RAM, "TelephoneUniversalCommunication"), "CompleteNumber"),
          email: t(contact.get(RAM, "EmailURIUniversalCommunication"), "URIID"),
        }
      : undefined,
  };
  for (const reg of el.all(RAM, "SpecifiedTaxRegistration")) {
    const id = reg.get(RAM, "ID");
    if (!id) continue;
    const scheme = id.attr("schemeID");
    if (scheme === "VA") party.vatId = id.text;
    else if (scheme === "FC") party.taxRegistrationId = id.text;
    else if (role === "taxrep" && !party.vatId) party.vatId = id.text;
  }
  return party;
}

function mapAllowanceCharge(el: XmlElement, documentLevel: boolean): AllowanceCharge {
  const indicator = el.get(RAM, "ChargeIndicator");
  const indicatorVal = indicator?.get(UDT, "Indicator")?.text ?? indicator?.text;
  const tax = el.get(RAM, "CategoryTradeTax");
  const ac: AllowanceCharge = {
    isCharge: indicatorVal === "true",
    amount: amount(el.get(RAM, "ActualAmount")),
    baseAmount: amount(el.get(RAM, "BasisAmount")),
    percentage: t(el, "CalculationPercent"),
    reason: t(el, "Reason"),
    reasonCode: t(el, "ReasonCode"),
  };
  if (documentLevel) {
    ac.vatCategory = t(tax, "CategoryCode");
    ac.vatRate = t(tax, "RateApplicablePercent");
  }
  return ac;
}

function mapPrice(agreement: XmlElement | undefined): Price | undefined {
  if (!agreement) return undefined;
  const net = agreement.get(RAM, "NetPriceProductTradePrice");
  const gross = agreement.get(RAM, "GrossPriceProductTradePrice");
  if (!net && !gross) return undefined;
  const bq = net?.get(RAM, "BasisQuantity");
  return {
    netPrice: amount(net?.get(RAM, "ChargeAmount")),
    grossPrice: amount(gross?.get(RAM, "ChargeAmount")),
    discount: amount(gross?.get(RAM, "AppliedTradeAllowanceCharge")?.get(RAM, "ActualAmount")),
    baseQuantity: bq?.text || undefined,
    baseQuantityUnit: bq?.attr("unitCode"),
  };
}

function mapItem(product: XmlElement | undefined): Item | undefined {
  if (!product) return undefined;
  return {
    name: t(product, "Name"),
    description: t(product, "Description"),
    sellerId: t(product, "SellerAssignedID"),
    buyerId: t(product, "BuyerAssignedID"),
    standardId: idOf(product.get(RAM, "GlobalID")),
    classificationIds: product
      .all(RAM, "DesignatedProductClassification")
      .map((c) => c.get(RAM, "ClassCode"))
      .filter((x): x is XmlElement => !!x)
      .map((c) => ({ value: c.text, scheme: c.attr("listID"), schemeVersion: c.attr("listVersionID") })),
    originCountry: t(product.get(RAM, "OriginTradeCountry"), "ID"),
    attributes: product
      .all(RAM, "ApplicableProductCharacteristic")
      .map((p) => ({ name: t(p, "Description"), value: t(p, "Value") })),
  };
}

function mapPeriodEl(el: XmlElement | undefined): Period | undefined {
  if (!el) return undefined;
  return {
    start: dateOf(el.get(RAM, "StartDateTime")),
    end: dateOf(el.get(RAM, "EndDateTime")),
  };
}

function mapLine(el: XmlElement): InvoiceLine {
  const doc = el.get(RAM, "AssociatedDocumentLineDocument");
  const agreement = el.get(RAM, "SpecifiedLineTradeAgreement");
  const delivery = el.get(RAM, "SpecifiedLineTradeDelivery");
  const settlement = el.get(RAM, "SpecifiedLineTradeSettlement");
  const product = el.get(RAM, "SpecifiedTradeProduct");
  const qty = delivery?.get(RAM, "BilledQuantity");
  const tax = settlement?.get(RAM, "ApplicableTradeTax");
  const objRef = settlement
    ?.all(RAM, "AdditionalReferencedDocument")
    .find((d) => t(d, "TypeCode") === "130");
  return {
    id: t(doc, "LineID"),
    note: t(doc?.get(RAM, "IncludedNote"), "Content"),
    objectId: objRef ? idOf(objRef.get(RAM, "IssuerAssignedID")) : undefined,
    quantity: qty?.text || undefined,
    unitCode: qty?.attr("unitCode"),
    netAmount: amount(settlement?.get(RAM, "SpecifiedTradeSettlementLineMonetarySummation")?.get(RAM, "LineTotalAmount")),
    orderLineRef: t(agreement?.get(RAM, "BuyerOrderReferencedDocument"), "LineID"),
    accountingRef: t(settlement?.get(RAM, "ReceivableSpecifiedTradeAccountingAccount"), "ID"),
    period: mapPeriodEl(settlement?.get(RAM, "BillingSpecifiedPeriod")),
    allowancesCharges: (settlement?.all(RAM, "SpecifiedTradeAllowanceCharge") ?? []).map((a) =>
      mapAllowanceCharge(a, false),
    ),
    price: mapPrice(agreement),
    vat: tax ? { categoryCode: t(tax, "CategoryCode"), rate: t(tax, "RateApplicablePercent") } : undefined,
    item: mapItem(product),
  };
}

/** Map a parsed CII CrossIndustryInvoice document to the semantic model. */
export function mapCii(root: XmlElement): Invoice {
  const inv = emptyInvoice("cii");

  const context = root.get(RSM, "ExchangedDocumentContext");
  inv.specificationId = t(context?.get(RAM, "GuidelineSpecifiedDocumentContextParameter"), "ID");
  inv.businessProcess = t(context?.get(RAM, "BusinessProcessSpecifiedDocumentContextParameter"), "ID");

  const doc = root.get(RSM, "ExchangedDocument");
  inv.number = t(doc, "ID");
  inv.typeCode = t(doc, "TypeCode");
  inv.issueDate = dateOf(doc?.get(RAM, "IssueDateTime"));
  for (const note of doc?.all(RAM, "IncludedNote") ?? []) {
    const text = t(note, "Content");
    if (text !== undefined) inv.notes.push({ subjectCode: t(note, "SubjectCode"), text });
  }

  const txn = root.get(RSM, "SupplyChainTradeTransaction");
  const agreement = txn?.get(RAM, "ApplicableHeaderTradeAgreement");
  const deliveryHdr = txn?.get(RAM, "ApplicableHeaderTradeDelivery");
  const settlement = txn?.get(RAM, "ApplicableHeaderTradeSettlement");

  inv.buyerReference = t(agreement, "BuyerReference");
  inv.seller = mapParty(agreement?.get(RAM, "SellerTradeParty"), "seller");
  inv.buyer = mapParty(agreement?.get(RAM, "BuyerTradeParty"), "buyer");
  inv.taxRepresentative = mapParty(agreement?.get(RAM, "SellerTaxRepresentativeTradeParty"), "taxrep");
  inv.purchaseOrderReference = t(agreement?.get(RAM, "BuyerOrderReferencedDocument"), "IssuerAssignedID");
  inv.salesOrderReference = t(agreement?.get(RAM, "SellerOrderReferencedDocument"), "IssuerAssignedID");
  inv.contractReference = t(agreement?.get(RAM, "ContractReferencedDocument"), "IssuerAssignedID");
  inv.projectReference = t(agreement?.get(RAM, "SpecifiedProcuringProject"), "ID");

  for (const ref of agreement?.all(RAM, "AdditionalReferencedDocument") ?? []) {
    const typeCode = t(ref, "TypeCode");
    if (typeCode === "50") {
      inv.tenderReference ??= t(ref, "IssuerAssignedID");
    } else if (typeCode === "130") {
      inv.objectId ??= idOf(ref.get(RAM, "IssuerAssignedID"));
      const scheme = t(ref, "ReferenceTypeCode");
      if (inv.objectId && scheme) inv.objectId.scheme = scheme;
    } else {
      const binary = ref.get(RAM, "AttachmentBinaryObject");
      const sup: SupportingDocument = {
        reference: t(ref, "IssuerAssignedID"),
        description: t(ref, "Name"),
        url: t(ref, "URIID"),
        attachment: binary
          ? { mimeCode: binary.attr("mimeCode"), filename: binary.attr("filename"), present: true }
          : undefined,
      };
      inv.supportingDocuments.push(sup);
    }
  }

  if (deliveryHdr) {
    inv.despatchAdviceReference = t(deliveryHdr.get(RAM, "DespatchAdviceReferencedDocument"), "IssuerAssignedID");
    inv.receivingAdviceReference = t(deliveryHdr.get(RAM, "ReceivingAdviceReferencedDocument"), "IssuerAssignedID");
    const shipTo = deliveryHdr.get(RAM, "ShipToTradeParty");
    const event = deliveryHdr.get(RAM, "ActualDeliverySupplyChainEvent");
    if (shipTo || event) {
      const address = mapAddress(shipTo?.get(RAM, "PostalTradeAddress"));
      const delivery: Delivery = {
        partyName: t(shipTo, "Name"),
        locationId: idOf(shipTo?.get(RAM, "ID")),
        date: dateOf(event?.get(RAM, "OccurrenceDateTime")),
        address,
        hasAddress: !!shipTo?.get(RAM, "PostalTradeAddress"),
      };
      inv.delivery = delivery;
    }
  }

  if (settlement) {
    inv.currency = t(settlement, "InvoiceCurrencyCode");
    inv.vatCurrency = t(settlement, "TaxCurrencyCode");
    inv.accountingRef = t(settlement.get(RAM, "ReceivableSpecifiedTradeAccountingAccount"), "ID");
    inv.payee = mapParty(settlement.get(RAM, "PayeeTradeParty"), "payee");
    inv.period = mapPeriodEl(settlement.get(RAM, "BillingSpecifiedPeriod"));

    for (const refDoc of settlement.all(RAM, "InvoiceReferencedDocument")) {
      inv.precedingInvoices.push({
        reference: t(refDoc, "IssuerAssignedID"),
        issueDate: dateOf(refDoc.get(RAM, "FormattedIssueDateTime")),
      });
    }

    const terms = settlement.get(RAM, "SpecifiedTradePaymentTerms");
    inv.paymentTerms = t(terms, "Description");
    inv.dueDate = dateOf(terms?.get(RAM, "DueDateDateTime"));

    const meansEls = settlement.all(RAM, "SpecifiedTradeSettlementPaymentMeans");
    if (meansEls.length > 0) {
      const first = meansEls[0]!;
      const card = first.get(RAM, "ApplicableTradeSettlementFinancialCard");
      const payment: PaymentInstructions = {
        meansCode: t(first, "TypeCode"),
        meansText: t(first, "Information"),
        remittanceInfo: t(settlement, "PaymentReference"),
        creditTransfers: meansEls
          .map((m) => {
            const acc = m.get(RAM, "PayeePartyCreditorFinancialAccount");
            if (!acc) return undefined;
            return {
              accountId: t(acc, "IBANID") ?? t(acc, "ProprietaryID"),
              accountName: t(acc, "AccountName"),
              providerId: t(m.get(RAM, "PayeeSpecifiedCreditorFinancialInstitution"), "BICID"),
            };
          })
          .filter((x): x is NonNullable<typeof x> => !!x),
        card: card ? { pan: t(card, "ID"), holder: t(card, "CardholderName") } : undefined,
        directDebit:
          t(terms, "DirectDebitMandateID") || first.get(RAM, "PayerPartyDebtorFinancialAccount")
            ? {
                mandateId: t(terms, "DirectDebitMandateID"),
                creditorId: t(settlement, "CreditorReferenceID"),
                debitedAccount: t(first.get(RAM, "PayerPartyDebtorFinancialAccount"), "IBANID"),
              }
            : undefined,
      };
      inv.payment = payment;
    }

    for (const tax of settlement.all(RAM, "ApplicableTradeTax")) {
      const breakdown: VatBreakdown = {
        taxableAmount: amount(tax.get(RAM, "BasisAmount")),
        taxAmount: amount(tax.get(RAM, "CalculatedAmount")),
        categoryCode: t(tax, "CategoryCode"),
        rate: t(tax, "RateApplicablePercent"),
        exemptionReason: t(tax, "ExemptionReason"),
        exemptionReasonCode: t(tax, "ExemptionReasonCode"),
      };
      inv.vatBreakdowns.push(breakdown);
      inv.taxPointDate ??= dateOf(tax.get(RAM, "TaxPointDate"));
      inv.taxPointDateCode ??= t(tax, "DueDateTypeCode");
    }

    inv.allowancesCharges = settlement
      .all(RAM, "SpecifiedTradeAllowanceCharge")
      .map((a) => mapAllowanceCharge(a, true));

    const sums = settlement.get(RAM, "SpecifiedTradeSettlementHeaderMonetarySummation");
    if (sums) {
      let vatTotal: Amount | undefined;
      let vatTotalAccounting: Amount | undefined;
      for (const ta of sums.all(RAM, "TaxTotalAmount")) {
        const amt = amount(ta);
        if (!amt) continue;
        if (inv.vatCurrency && amt.currency === inv.vatCurrency && inv.vatCurrency !== inv.currency) {
          vatTotalAccounting = amt;
        } else if (!vatTotal) {
          vatTotal = amt;
        }
      }
      inv.totals = {
        lineTotal: amount(sums.get(RAM, "LineTotalAmount")),
        allowanceTotal: amount(sums.get(RAM, "AllowanceTotalAmount")),
        chargeTotal: amount(sums.get(RAM, "ChargeTotalAmount")),
        taxExclusive: amount(sums.get(RAM, "TaxBasisTotalAmount")),
        vatTotal,
        vatTotalAccounting,
        taxInclusive: amount(sums.get(RAM, "GrandTotalAmount")),
        paid: amount(sums.get(RAM, "TotalPrepaidAmount")),
        rounding: amount(sums.get(RAM, "RoundingAmount")),
        payable: amount(sums.get(RAM, "DuePayableAmount")),
      };
    }
  }

  inv.lines = (txn?.all(RAM, "IncludedSupplyChainTradeLineItem") ?? []).map(mapLine);

  return inv;
}

const RSM = NS_CII;
