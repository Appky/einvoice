/**
 * Minimal namespace-aware XML parser.
 *
 * Deliberately supports only the XML subset that appears in e-invoice
 * documents: elements, attributes, namespaces, character data, CDATA,
 * comments, processing instructions and the five predefined entities plus
 * numeric character references.
 *
 * DOCTYPE declarations are rejected. There is no entity expansion beyond
 * the predefined set, no external resource access of any kind, and no
 * parameter entities — the parser is immune to XXE and billion-laughs
 * attacks by construction, which matters when validating third-party
 * invoices.
 */

export interface XmlAttr {
  /** Local name (without prefix). */
  name: string;
  /** Resolved namespace URI, or empty string for unprefixed attributes. */
  ns: string;
  value: string;
}

export class XmlElement {
  constructor(
    /** Local name (without prefix). */
    public readonly name: string,
    /** Resolved namespace URI ("" if none). */
    public readonly ns: string,
    public readonly attrs: XmlAttr[] = [],
    public readonly children: XmlElement[] = [],
    private textParts: string[] = [],
  ) {}

  appendText(t: string): void {
    this.textParts.push(t);
  }

  /** Concatenated direct character data of this element, whitespace-trimmed. */
  get text(): string {
    return this.textParts.join("").trim();
  }

  /** Value of an (unprefixed or any-namespace) attribute by local name. */
  attr(name: string): string | undefined {
    return this.attrs.find((a) => a.name === name)?.value;
  }

  /** First child element with the given namespace URI and local name. */
  get(ns: string, name: string): XmlElement | undefined {
    return this.children.find((c) => c.name === name && c.ns === ns);
  }

  /** All child elements with the given namespace URI and local name. */
  all(ns: string, name: string): XmlElement[] {
    return this.children.filter((c) => c.name === name && c.ns === ns);
  }

  /** Descend along a path of [ns, name] steps; undefined if any step is missing. */
  path(...steps: Array<readonly [string, string]>): XmlElement | undefined {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let cur: XmlElement | undefined = this;
    for (const [ns, name] of steps) {
      cur = cur?.get(ns, name);
      if (!cur) return undefined;
    }
    return cur;
  }
}

export class XmlParseError extends Error {
  constructor(
    message: string,
    public readonly offset: number,
    public readonly line: number,
    public readonly column: number,
  ) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "XmlParseError";
  }
}

/** Hard input limits: invoices are small documents; these caps are generous
 * for real e-invoices while bounding memory and CPU for hostile input. */
export const XML_LIMITS = {
  /** Maximum input size in bytes/characters (25 MB). */
  maxInput: 25 * 1024 * 1024,
  /** Maximum element nesting depth. */
  maxDepth: 128,
  /** Maximum total number of elements. */
  maxNodes: 500_000,
} as const;

const PREDEFINED: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  apos: "'",
  quot: '"',
};

const NAME_START = /[A-Za-z_À-˿Ͱ-῿Ⰰ-퟿]/;
const NAME_CHAR = /[A-Za-z0-9._\-·À-˿̀-ͯͰ-῿Ⰰ-퟿]/;

/** Decode input bytes to a string, honouring BOMs and the encoding declaration. */
export function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 120));
  const m = /encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(head);
  const enc = m?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(enc).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Parse an XML document and return its root element. */
export function parseXml(input: string | Uint8Array): XmlElement {
  const s = typeof input === "string" ? stripBom(input) : decodeXmlBytes(input);
  return new Parser(s).parseDocument();
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

interface NsScope {
  default: string;
  prefixes: Map<string, string>;
}

class Parser {
  private pos = 0;
  private depth = 0;
  private nodes = 0;

  constructor(private readonly s: string) {
    if (s.length > XML_LIMITS.maxInput) {
      throw new XmlParseError(`Input exceeds the ${XML_LIMITS.maxInput / (1024 * 1024)} MB limit`, 0, 1, 1);
    }
  }

  private fail(message: string, at = this.pos): never {
    let line = 1;
    let col = 1;
    for (let i = 0; i < at && i < this.s.length; i++) {
      if (this.s[i] === "\n") {
        line++;
        col = 1;
      } else col++;
    }
    throw new XmlParseError(message, at, line, col);
  }

  parseDocument(): XmlElement {
    this.skipProlog();
    const scope: NsScope = { default: "", prefixes: new Map([["xml", "http://www.w3.org/XML/1998/namespace"]]) };
    const root = this.parseElement(scope);
    this.skipMisc();
    if (this.pos < this.s.length) this.fail("Content after document element");
    return root;
  }

  private skipProlog(): void {
    this.skipWs();
    if (this.s.startsWith("<?xml", this.pos)) {
      const end = this.s.indexOf("?>", this.pos);
      if (end < 0) this.fail("Unterminated XML declaration");
      this.pos = end + 2;
    }
    this.skipMisc();
    if (this.s.startsWith("<!DOCTYPE", this.pos)) {
      this.fail("DOCTYPE declarations are not allowed", this.pos);
    }
  }

  private skipMisc(): void {
    for (;;) {
      this.skipWs();
      if (this.s.startsWith("<!--", this.pos)) {
        const end = this.s.indexOf("-->", this.pos + 4);
        if (end < 0) this.fail("Unterminated comment");
        this.pos = end + 3;
      } else if (this.s.startsWith("<?", this.pos)) {
        const end = this.s.indexOf("?>", this.pos + 2);
        if (end < 0) this.fail("Unterminated processing instruction");
        this.pos = end + 2;
      } else {
        return;
      }
    }
  }

  private skipWs(): void {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos]!)) this.pos++;
  }

  private parseElement(parentScope: NsScope): XmlElement {
    if (this.s[this.pos] !== "<") this.fail("Expected element");
    if (++this.depth > XML_LIMITS.maxDepth) this.fail(`Element nesting exceeds the depth limit of ${XML_LIMITS.maxDepth}`);
    if (++this.nodes > XML_LIMITS.maxNodes) this.fail(`Document exceeds the limit of ${XML_LIMITS.maxNodes} elements`);
    this.pos++;
    const qname = this.readName();
    const rawAttrs: Array<{ qname: string; value: string }> = [];
    let selfClosing = false;
    for (;;) {
      this.skipWs();
      const c = this.s[this.pos];
      if (c === undefined) this.fail("Unterminated start tag");
      if (c === ">") {
        this.pos++;
        break;
      }
      if (c === "/") {
        if (this.s[this.pos + 1] !== ">") this.fail("Malformed empty-element tag");
        this.pos += 2;
        selfClosing = true;
        break;
      }
      const aq = this.readName();
      this.skipWs();
      if (this.s[this.pos] !== "=") this.fail(`Expected '=' after attribute ${aq}`);
      this.pos++;
      this.skipWs();
      rawAttrs.push({ qname: aq, value: this.readQuoted() });
    }

    // Build namespace scope for this element.
    let scope = parentScope;
    let scopeCloned = false;
    const cloneScope = () => {
      if (!scopeCloned) {
        scope = { default: scope.default, prefixes: new Map(scope.prefixes) };
        scopeCloned = true;
      }
    };
    for (const a of rawAttrs) {
      if (a.qname === "xmlns") {
        cloneScope();
        scope.default = a.value;
      } else if (a.qname.startsWith("xmlns:")) {
        cloneScope();
        scope.prefixes.set(a.qname.slice(6), a.value);
      }
    }

    const resolve = (q: string, isAttr: boolean): { name: string; ns: string } => {
      const i = q.indexOf(":");
      if (i < 0) return { name: q, ns: isAttr ? "" : scope.default };
      const prefix = q.slice(0, i);
      const local = q.slice(i + 1);
      const ns = scope.prefixes.get(prefix);
      if (ns === undefined) this.fail(`Undeclared namespace prefix "${prefix}"`);
      return { name: local, ns };
    };

    const { name, ns } = resolve(qname, false);
    const attrs: XmlAttr[] = [];
    for (const a of rawAttrs) {
      if (a.qname === "xmlns" || a.qname.startsWith("xmlns:")) continue;
      const r = resolve(a.qname, true);
      attrs.push({ name: r.name, ns: r.ns, value: a.value });
    }
    const el = new XmlElement(name, ns, attrs);
    if (selfClosing) {
      this.depth--;
      return el;
    }

    // Content
    for (;;) {
      const lt = this.s.indexOf("<", this.pos);
      if (lt < 0) this.fail("Unterminated element " + qname);
      if (lt > this.pos) {
        el.appendText(this.decodeEntities(this.s.slice(this.pos, lt)));
        this.pos = lt;
      }
      if (this.s.startsWith("</", this.pos)) {
        this.pos += 2;
        const endName = this.readName();
        if (endName !== qname) this.fail(`Mismatched end tag </${endName}>, expected </${qname}>`);
        this.skipWs();
        if (this.s[this.pos] !== ">") this.fail("Malformed end tag");
        this.pos++;
        this.depth--;
        return el;
      }
      if (this.s.startsWith("<!--", this.pos)) {
        const end = this.s.indexOf("-->", this.pos + 4);
        if (end < 0) this.fail("Unterminated comment");
        this.pos = end + 3;
        continue;
      }
      if (this.s.startsWith("<![CDATA[", this.pos)) {
        const end = this.s.indexOf("]]>", this.pos + 9);
        if (end < 0) this.fail("Unterminated CDATA section");
        el.appendText(this.s.slice(this.pos + 9, end));
        this.pos = end + 3;
        continue;
      }
      if (this.s.startsWith("<?", this.pos)) {
        const end = this.s.indexOf("?>", this.pos + 2);
        if (end < 0) this.fail("Unterminated processing instruction");
        this.pos = end + 2;
        continue;
      }
      if (this.s.startsWith("<!", this.pos)) this.fail("Unexpected markup declaration in content");
      el.children.push(this.parseElement(scope));
    }
  }

  private readName(): string {
    const start = this.pos;
    const first = this.s[this.pos];
    if (first === undefined || !(NAME_START.test(first) || first === ":")) this.fail("Invalid name");
    this.pos++;
    while (this.pos < this.s.length) {
      const c = this.s[this.pos]!;
      if (NAME_CHAR.test(c) || c === ":") this.pos++;
      else break;
    }
    return this.s.slice(start, this.pos);
  }

  private readQuoted(): string {
    const q = this.s[this.pos];
    if (q !== '"' && q !== "'") this.fail("Expected quoted attribute value");
    this.pos++;
    const end = this.s.indexOf(q, this.pos);
    if (end < 0) this.fail("Unterminated attribute value");
    const raw = this.s.slice(this.pos, end);
    if (raw.includes("<")) this.fail("'<' is not allowed in attribute values");
    this.pos = end + 1;
    return this.decodeEntities(raw);
  }

  private decodeEntities(text: string): string {
    if (!text.includes("&")) return text;
    return text.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (whole, body: string, offset: number) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const cp = parseInt(body.slice(2), 16);
        if (Number.isNaN(cp)) this.fail("Invalid character reference", this.pos);
        return String.fromCodePoint(cp);
      }
      if (body.startsWith("#")) {
        const cp = parseInt(body.slice(1), 10);
        if (Number.isNaN(cp)) this.fail("Invalid character reference", this.pos);
        return String.fromCodePoint(cp);
      }
      const known = PREDEFINED[body];
      if (known === undefined) {
        this.fail(`Unknown entity &${body}; (custom entities are not supported)`, this.pos + offset);
      }
      return known;
    });
  }
}
