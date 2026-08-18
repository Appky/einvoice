/**
 * einvoice-mcp — Model Context Protocol server exposing e-invoice reading
 * and validation to AI agents, over stdio (newline-delimited JSON-RPC 2.0).
 *
 * Tools:
 *   validate_invoice  — EN 16931 business-rule validation with findings
 *   read_invoice      — parse any supported invoice into a summary + data
 *
 * Everything runs locally in-process; invoice contents never leave the
 * machine. Zero dependencies beyond the einvoice core library.
 */

import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import process from "node:process";
import { parseInvoice, validate, renderText, VERSION } from "einvoice-kit";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "validate_invoice",
    description:
      "Validate an EU e-invoice against the EN 16931 business rules (the standard behind XRechnung, Factur-X/ZUGFeRD, Peppol BIS and the 2025-2028 EU e-invoicing mandates). Accepts UBL 2.1, UN/CEFACT CII XML, or a Factur-X/ZUGFeRD PDF. Returns a verdict plus per-rule findings with plain-language hints. Runs locally; nothing is uploaded.",
    inputSchema: {
      type: "object",
      properties: {
        xml: { type: "string", description: "Invoice XML content (UBL or CII). Provide either xml or path." },
        path: { type: "string", description: "Filesystem path to an invoice file (.xml or Factur-X/ZUGFeRD .pdf)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_invoice",
    description:
      "Parse an EU e-invoice (UBL, CII, XRechnung, Peppol BIS, or Factur-X/ZUGFeRD PDF) and return a human-readable summary plus the structured data: parties, lines, VAT breakdown, totals, payment details. Runs locally; nothing is uploaded.",
    inputSchema: {
      type: "object",
      properties: {
        xml: { type: "string", description: "Invoice XML content. Provide either xml or path." },
        path: { type: "string", description: "Filesystem path to an invoice file (.xml or .pdf)." },
      },
      additionalProperties: false,
    },
  },
];

function loadInput(params: Record<string, unknown>): string | Uint8Array {
  const xml = params["xml"];
  const path = params["path"];
  if (typeof xml === "string" && xml.trim() !== "") return xml;
  if (typeof path === "string" && path.trim() !== "") return new Uint8Array(readFileSync(path));
  throw new Error("Provide either `xml` (invoice XML content) or `path` (path to an .xml or .pdf file).");
}

async function callTool(name: string, params: Record<string, unknown>): Promise<string> {
  const input = loadInput(params);
  const { invoice, format, profile } = await parseInvoice(input);
  if (name === "validate_invoice") {
    const res = validate(invoice);
    const lines = [
      `${res.ok ? "VALID" : "INVALID"} (${format}${profile.name ? `, ${profile.name}` : ""}) — ${res.errors} error(s), ${res.warnings} warning(s)`,
    ];
    for (const f of res.findings) {
      lines.push(`${f.severity === "fatal" ? "ERROR" : "WARN"} ${f.rule}${f.where ? ` [${f.where}]` : ""}: ${f.hint ?? f.text}`);
    }
    if (res.findings.length === 0) lines.push("All implemented EN 16931 business rules are satisfied.");
    return lines.join("\n");
  }
  if (name === "read_invoice") {
    const summary = renderText(invoice);
    return `${summary}\n\n--- structured data (JSON) ---\n${JSON.stringify({ format, profile, invoice }, null, 2)}`;
  }
  throw new Error(`Unknown tool: ${name}`);
}

function reply(id: number | string | null | undefined, result?: unknown, error?: { code: number; message: string }): void {
  if (id === undefined || id === null) return;
  const msg = error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  void (async () => {
    if (line.trim() === "") return;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      return;
    }
    try {
      switch (req.method) {
        case "initialize": {
          const requested = (req.params?.["protocolVersion"] as string) ?? "2024-11-05";
          reply(req.id, {
            protocolVersion: requested,
            capabilities: { tools: {} },
            serverInfo: { name: "einvoice-mcp", version: VERSION },
          });
          break;
        }
        case "notifications/initialized":
          break;
        case "ping":
          reply(req.id, {});
          break;
        case "tools/list":
          reply(req.id, { tools: TOOLS });
          break;
        case "tools/call": {
          const name = req.params?.["name"] as string;
          const args = (req.params?.["arguments"] as Record<string, unknown>) ?? {};
          try {
            const text = await callTool(name, args);
            reply(req.id, { content: [{ type: "text", text }], isError: false });
          } catch (e) {
            reply(req.id, { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true });
          }
          break;
        }
        default:
          reply(req.id, undefined, { code: -32601, message: `Method not found: ${req.method}` });
      }
    } catch (e) {
      reply(req.id, undefined, { code: -32603, message: (e as Error).message });
    }
  })();
});
