/**
 * The EN 16931 semantic model, as a plain typed object graph.
 *
 * Field names follow the semantic model's business terms; every field's
 * BT/BG number is recorded in its doc comment. Monetary values keep their
 * *lexical* string form (`amount`) because several rules (BR-DEC group)
 * are defined over the lexical representation, not the numeric value.
 *
 * Both the UBL 2.1 and CII (UN/CEFACT Cross-Industry Invoice) mappers
 * produce this model, so every business rule is written once.
 */

/** A monetary or numeric value, preserving its lexical XML form. */
export interface Amount {
  /** Raw text exactly as it appeared in the document. */
  raw: string;
  /** currencyID attribute if present. */
  currency?: string;
}

/** An identifier with an optional scheme (e.g. schemeID attribute). */
export interface Id {
  value: string;
  scheme?: string;
  schemeVersion?: string;
}

/** BG-4 Seller / BG-7 Buyer / BG-10 Payee / BG-11 Tax representative. */
export interface Party {
  /** BT-27 / BT-44 / BT-59 / BT-62 — name. */
  name?: string;
  /** BT-28 / BT-45 — trading name. */
  tradingName?: string;
  /** BT-29 / BT-46 / BT-60 — identifiers. */
  identifiers: Id[];
  /** BT-30 / BT-47 / BT-61 — legal registration identifier. */
  legalRegistrationId?: Id;
  /** BT-31 / BT-48 / BT-63 — VAT identifier. */
  vatId?: string;
  /** BT-32 — seller tax registration identifier (e.g. local tax number). */
  taxRegistrationId?: string;
  /** BT-33 — additional legal information. */
  legalInfo?: string;
  /** BT-34 / BT-49 — electronic address. */
  electronicAddress?: Id;
  /** BG-5 / BG-8 / BG-12 — postal address. */
  address?: PostalAddress;
  /** BG-6 / BG-9 — contact. */
  contact?: Contact;
}

/** BG-5 / BG-8 / BG-12 / BG-15 postal address. */
export interface PostalAddress {
  /** BT-35 / BT-50 / BT-64 / BT-75 — address line 1. */
  line1?: string;
  /** BT-36 / BT-51 / BT-65 / BT-76 — address line 2. */
  line2?: string;
  /** BT-162 / BT-163 / BT-164 / BT-165 — address line 3. */
  line3?: string;
  /** BT-37 / BT-52 / BT-66 / BT-77 — city. */
  city?: string;
  /** BT-38 / BT-53 / BT-67 / BT-78 — post code. */
  postCode?: string;
  /** BT-39 / BT-54 / BT-68 / BT-79 — country subdivision. */
  subdivision?: string;
  /** BT-40 / BT-55 / BT-69 / BT-80 — country code (ISO 3166-1 alpha-2). */
  countryCode?: string;
}

/** BG-6 / BG-9 contact. */
export interface Contact {
  /** BT-41 / BT-56 — contact point. */
  name?: string;
  /** BT-42 / BT-57 — telephone. */
  phone?: string;
  /** BT-43 / BT-58 — e-mail. */
  email?: string;
}

/** BG-14 invoicing period / BG-26 line period. */
export interface Period {
  /** BT-73 / BT-134 — start date (YYYY-MM-DD). */
  start?: string;
  /** BT-74 / BT-135 — end date (YYYY-MM-DD). */
  end?: string;
}

/** BG-20/BG-21 document level, BG-27/BG-28 line level allowance or charge. */
export interface AllowanceCharge {
  /** true = charge (BG-21/BG-28), false = allowance (BG-20/BG-27). */
  isCharge: boolean;
  /** BT-92/BT-99/BT-136/BT-141 — amount. */
  amount?: Amount;
  /** BT-93/BT-100/BT-137/BT-142 — base amount. */
  baseAmount?: Amount;
  /** BT-94/BT-101/BT-138/BT-143 — percentage. */
  percentage?: string;
  /** BT-95/BT-102 — VAT category code (document level only). */
  vatCategory?: string;
  /** BT-96/BT-103 — VAT rate (document level only). */
  vatRate?: string;
  /** BT-97/BT-104/BT-139/BT-144 — reason text. */
  reason?: string;
  /** BT-98/BT-105/BT-140/BT-145 — reason code. */
  reasonCode?: string;
}

/** BG-23 VAT breakdown. */
export interface VatBreakdown {
  /** BT-116 — VAT category taxable amount. */
  taxableAmount?: Amount;
  /** BT-117 — VAT category tax amount. */
  taxAmount?: Amount;
  /** BT-118 — VAT category code (UNCL 5305: S, Z, E, AE, K, G, O, L, M, B). */
  categoryCode?: string;
  /** BT-119 — VAT category rate (percentage). */
  rate?: string;
  /** BT-120 — VAT exemption reason text. */
  exemptionReason?: string;
  /** BT-121 — VAT exemption reason code (VATEX). */
  exemptionReasonCode?: string;
}

/** BG-16 payment instructions. */
export interface PaymentInstructions {
  /** BT-81 — payment means type code (UNCL 4461). */
  meansCode?: string;
  /** BT-82 — payment means text. */
  meansText?: string;
  /** BT-83 — remittance information. */
  remittanceInfo?: string;
  /** BG-17 — credit transfers. */
  creditTransfers: CreditTransfer[];
  /** BG-18 — payment card information. */
  card?: { pan?: string; holder?: string };
  /** BG-19 — direct debit. */
  directDebit?: { mandateId?: string; creditorId?: string; debitedAccount?: string };
}

/** BG-17 credit transfer. */
export interface CreditTransfer {
  /** BT-84 — payment account identifier (IBAN or other). */
  accountId?: string;
  /** BT-85 — payment account name. */
  accountName?: string;
  /** BT-86 — payment service provider identifier (BIC). */
  providerId?: string;
}

/** BG-24 additional supporting document. */
export interface SupportingDocument {
  /** BT-122 — supporting document reference. */
  reference?: string;
  /** BT-123 — description. */
  description?: string;
  /** BT-124 — external document location (URL). */
  url?: string;
  /** BT-125 — attached document (base64) with mime code and filename. */
  attachment?: { mimeCode?: string; filename?: string; present: boolean };
}

/** BG-30 line VAT information. */
export interface LineVat {
  /** BT-151 — invoiced item VAT category code. */
  categoryCode?: string;
  /** BT-152 — invoiced item VAT rate. */
  rate?: string;
}

/** BG-29 price details. */
export interface Price {
  /** BT-146 — item net price. */
  netPrice?: Amount;
  /** BT-147 — item price discount. */
  discount?: Amount;
  /** BT-148 — item gross price. */
  grossPrice?: Amount;
  /** BT-149 — item price base quantity. */
  baseQuantity?: string;
  /** BT-150 — base quantity unit code. */
  baseQuantityUnit?: string;
}

/** BG-32 item attribute. */
export interface ItemAttribute {
  /** BT-160 — name. */
  name?: string;
  /** BT-161 — value. */
  value?: string;
}

/** BG-31 item information. */
export interface Item {
  /** BT-153 — item name. */
  name?: string;
  /** BT-154 — item description. */
  description?: string;
  /** BT-155 — item seller's identifier. */
  sellerId?: string;
  /** BT-156 — item buyer's identifier. */
  buyerId?: string;
  /** BT-157 — item standard identifier. */
  standardId?: Id;
  /** BT-158 — item classification identifiers. */
  classificationIds: Id[];
  /** BT-159 — item country of origin. */
  originCountry?: string;
  /** BG-32 — attributes. */
  attributes: ItemAttribute[];
}

/** BG-25 invoice line. */
export interface InvoiceLine {
  /** BT-126 — line identifier. */
  id?: string;
  /** BT-127 — line note. */
  note?: string;
  /** BT-128 — line object identifier. */
  objectId?: Id;
  /** BT-129 — invoiced quantity. */
  quantity?: string;
  /** BT-130 — quantity unit of measure code (UN/ECE Recommendation 20/21). */
  unitCode?: string;
  /** BT-131 — line net amount. */
  netAmount?: Amount;
  /** BT-132 — referenced purchase order line reference. */
  orderLineRef?: string;
  /** BT-133 — line buyer accounting reference. */
  accountingRef?: string;
  /** BG-26 — line period. */
  period?: Period;
  /** BG-27/BG-28 — line allowances and charges. */
  allowancesCharges: AllowanceCharge[];
  /** BG-29 — price details. */
  price?: Price;
  /** BG-30 — line VAT information. */
  vat?: LineVat;
  /** BG-31 — item information. */
  item?: Item;
}

/** BG-22 document totals. */
export interface Totals {
  /** BT-106 — sum of invoice line net amounts. */
  lineTotal?: Amount;
  /** BT-107 — sum of document level allowances. */
  allowanceTotal?: Amount;
  /** BT-108 — sum of document level charges. */
  chargeTotal?: Amount;
  /** BT-109 — invoice total without VAT. */
  taxExclusive?: Amount;
  /** BT-110 — invoice total VAT amount. */
  vatTotal?: Amount;
  /** BT-111 — invoice total VAT amount in accounting currency. */
  vatTotalAccounting?: Amount;
  /** BT-112 — invoice total with VAT. */
  taxInclusive?: Amount;
  /** BT-113 — paid amount. */
  paid?: Amount;
  /** BT-114 — rounding amount. */
  rounding?: Amount;
  /** BT-115 — amount due for payment. */
  payable?: Amount;
}

/** BG-3 preceding invoice reference. */
export interface PrecedingInvoice {
  /** BT-25 — reference. */
  reference?: string;
  /** BT-26 — issue date. */
  issueDate?: string;
}

/** BG-13 delivery information. */
export interface Delivery {
  /** BT-70 — deliver to party name. */
  partyName?: string;
  /** BT-71 — deliver to location identifier. */
  locationId?: Id;
  /** BT-72 — actual delivery date. */
  date?: string;
  /** BG-15 — deliver to address. */
  address?: PostalAddress;
  /** True when a BG-15 address group is present in the document. */
  hasAddress: boolean;
}

/** The invoice document (EN 16931 semantic model root). */
export interface Invoice {
  /** Which concrete syntax the document used. */
  syntax: "ubl-invoice" | "ubl-creditnote" | "cii";
  /** BT-24 — specification identifier (CustomizationID). */
  specificationId?: string;
  /** BT-23 — business process type (ProfileID). */
  businessProcess?: string;
  /** BT-1 — invoice number. */
  number?: string;
  /** BT-2 — issue date (normalized to YYYY-MM-DD where possible). */
  issueDate?: string;
  /** BT-3 — invoice type code (UNCL 1001). */
  typeCode?: string;
  /** BT-5 — invoice currency code. */
  currency?: string;
  /** BT-6 — VAT accounting currency code. */
  vatCurrency?: string;
  /** BT-7 — VAT point date. */
  taxPointDate?: string;
  /** BT-8 — VAT point date code (UNCL 2005 restriction: 3, 35, 432). */
  taxPointDateCode?: string;
  /** BT-9 — payment due date. */
  dueDate?: string;
  /** BT-10 — buyer reference. */
  buyerReference?: string;
  /** BT-11 — project reference. */
  projectReference?: string;
  /** BT-12 — contract reference. */
  contractReference?: string;
  /** BT-13 — purchase order reference. */
  purchaseOrderReference?: string;
  /** BT-14 — sales order reference. */
  salesOrderReference?: string;
  /** BT-15 — receiving advice reference. */
  receivingAdviceReference?: string;
  /** BT-16 — despatch advice reference. */
  despatchAdviceReference?: string;
  /** BT-17 — tender or lot reference. */
  tenderReference?: string;
  /** BT-18 — invoiced object identifier. */
  objectId?: Id;
  /** BT-19 — buyer accounting reference. */
  accountingRef?: string;
  /** BT-20 — payment terms. */
  paymentTerms?: string;
  /** BT-22 — invoice notes (BG-1; BT-21 subject codes kept inline). */
  notes: Array<{ subjectCode?: string; text: string }>;
  /** BG-14 — invoicing period. */
  period?: Period;
  /** BG-3 — preceding invoice references. */
  precedingInvoices: PrecedingInvoice[];
  /** BG-4 — seller. */
  seller?: Party;
  /** BG-7 — buyer. */
  buyer?: Party;
  /** BG-10 — payee. */
  payee?: Party;
  /** BG-11 — seller tax representative. */
  taxRepresentative?: Party;
  /** BG-13 — delivery information. */
  delivery?: Delivery;
  /** BG-16 — payment instructions. */
  payment?: PaymentInstructions;
  /** BG-20/BG-21 — document level allowances and charges. */
  allowancesCharges: AllowanceCharge[];
  /** BG-22 — document totals. */
  totals: Totals;
  /** BG-23 — VAT breakdown. */
  vatBreakdowns: VatBreakdown[];
  /** BG-24 — additional supporting documents. */
  supportingDocuments: SupportingDocument[];
  /** BG-25 — invoice lines. */
  lines: InvoiceLine[];
}

export function emptyInvoice(syntax: Invoice["syntax"]): Invoice {
  return {
    syntax,
    notes: [],
    precedingInvoices: [],
    allowancesCharges: [],
    totals: {},
    vatBreakdowns: [],
    supportingDocuments: [],
    lines: [],
  };
}
