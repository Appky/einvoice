/**
 * Factur-X / ZUGFeRD support: extract the embedded XML invoice from a hybrid
 * PDF without a PDF rendering library.
 *
 * PDF object streams can compress most of a document's dictionaries, but
 * stream objects themselves (and therefore the embedded file's bytes) always
 * appear as top-level `obj … stream … endstream` spans. We scan for embedded
 * file streams, inflate them when FlateDecode-compressed, and return the
 * ones that parse as a CII or UBL invoice document.
 */

const latin1 = new TextDecoder("latin1");

async function inflate(data: Uint8Array): Promise<Uint8Array | undefined> {
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const ds = new DecompressionStream(format);
      const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      // try next format
    }
  }
  return undefined;
}

export interface EmbeddedXml {
  bytes: Uint8Array;
  /** Filename hint if one was found near the stream (e.g. factur-x.xml). */
  filename?: string;
}

const KNOWN_NAMES = /(factur-x\.xml|zugferd-invoice\.xml|xrechnung\.xml|order-x\.xml|cida\.xml)/i;

/** True when the buffer looks like a PDF file. */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/**
 * Extract embedded XML files that look like e-invoices from a PDF.
 * Returns candidates in order of confidence (known filenames first).
 */
export async function extractEmbeddedXml(pdf: Uint8Array): Promise<EmbeddedXml[]> {
  const text = latin1.decode(pdf);
  const results: EmbeddedXml[] = [];

  // Filename hints from filespec dictionaries.
  const nameHint = KNOWN_NAMES.exec(text)?.[1];

  for (const { dict, afterDict } of scanDicts(text)) {
    // The dictionary must introduce a stream.
    const streamKw = /^\s*stream(\r?\n|\r)/.exec(text.slice(afterDict, afterDict + 12));
    if (!streamKw) continue;
    const dataStart = afterDict + streamKw[0].length;
    const end = text.indexOf("endstream", dataStart);
    if (end < 0) continue;
    // Trim the optional EOL before `endstream`.
    let dataEnd = end;
    if (text[dataEnd - 1] === "\n") dataEnd--;
    if (text[dataEnd - 1] === "\r") dataEnd--;

    const isEmbeddedFile = /\/Type\s*\/EmbeddedFile/.test(dict);
    const subtypeXml = /\/Subtype\s*\/(?:text#2[Ff]xml|application#2[Ff]xml|xml)/.test(dict);
    if (!isEmbeddedFile && !subtypeXml) continue;

    let bytes: Uint8Array = pdf.subarray(dataStart, dataEnd);
    if (/\/Filter\s*\/FlateDecode/.test(dict) || /\/Filter\s*\[\s*\/FlateDecode\s*\]/.test(dict)) {
      const inflated = await inflate(bytes);
      if (!inflated) continue;
      bytes = inflated;
    }

    // Quick sanity check: does this look like XML at all?
    const head = latin1.decode(bytes.subarray(0, 200)).trimStart();
    if (!head.startsWith("<")) continue;
    results.push({ bytes, filename: nameHint });
  }

  // Prefer streams whose content mentions the CII/UBL invoice roots.
  results.sort((a, b) => score(b) - score(a));
  return results;
}

interface DictSpan {
  /** Dictionary source text (between the outer << >>). */
  dict: string;
  /** Offset just past the closing >>. */
  afterDict: number;
}

/**
 * Scan the document for top-level dictionaries, respecting PDF lexical
 * structure: nested dictionaries, hex strings (<...>), literal strings
 * with escapes and balanced parentheses, and comments.
 */
function* scanDicts(text: string): Generator<DictSpan> {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const start = text.indexOf("<<", i);
    if (start < 0) return;
    let depth = 0;
    let j = start;
    while (j < n) {
      const ch = text[j]!;
      if (ch === "<" && text[j + 1] === "<") {
        depth++;
        j += 2;
      } else if (ch === ">" && text[j + 1] === ">") {
        depth--;
        j += 2;
        if (depth === 0) break;
      } else if (ch === "<") {
        // hex string
        const close = text.indexOf(">", j + 1);
        j = close < 0 ? n : close + 1;
      } else if (ch === "(") {
        // literal string with escapes and balanced parens
        let p = 1;
        j++;
        while (j < n && p > 0) {
          const c = text[j]!;
          if (c === "\\") j += 2;
          else {
            if (c === "(") p++;
            else if (c === ")") p--;
            j++;
          }
        }
      } else if (ch === "%") {
        const eol = text.indexOf("\n", j);
        j = eol < 0 ? n : eol + 1;
      } else {
        j++;
      }
    }
    if (depth !== 0) return;
    yield { dict: text.slice(start + 2, j - 2), afterDict: j };
    // Skip the stream body (binary data may contain bytes that look like
    // dictionary delimiters) so the scan resumes after `endstream`.
    const streamKw = /^\s*stream(\r?\n|\r)/.exec(text.slice(j, j + 12));
    if (streamKw) {
      const end = text.indexOf("endstream", j + streamKw[0].length);
      i = end < 0 ? n : end + "endstream".length;
    } else {
      i = j;
    }
  }
}

function score(e: EmbeddedXml): number {
  const head = latin1.decode(e.bytes.subarray(0, 600));
  if (head.includes("CrossIndustryInvoice")) return 2;
  if (head.includes("Invoice") || head.includes("CreditNote")) return 1;
  return 0;
}
