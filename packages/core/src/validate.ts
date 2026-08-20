/** Validation orchestrator: run all rule groups over a semantic model. */

import { Invoice } from "./model.js";
import { Ctx, Finding, ValidationResult } from "./rules-util.js";
import { coreRules } from "./rules-core.js";
import { vatCategoryRules } from "./rules-vat.js";
import { codeListRules } from "./rules-codes.js";
import { isXRechnung, xrechnungRules } from "./rules-xrechnung.js";

export type { Finding, ValidationResult, Severity } from "./rules-util.js";

/** Approximate number of distinct EN 16931 rules evaluated by this engine. */
export const RULES_IMPLEMENTED = 196;

export interface ValidateOptions {
  /**
   * National/CIUS rule pack selection. "auto" (default) applies the XRechnung
   * BR-DE pack when the specification identifier (BT-24) declares XRechnung;
   * "en16931" runs only the core rules; "xrechnung" forces the BR-DE pack.
   */
  profile?: "auto" | "en16931" | "xrechnung";
}

export function validate(inv: Invoice, options: ValidateOptions = {}): ValidationResult {
  const profile = options.profile ?? "auto";
  const c = new Ctx(inv);
  coreRules(c);
  vatCategoryRules(c);
  codeListRules(c);
  if (profile === "xrechnung" || (profile === "auto" && isXRechnung(inv))) {
    xrechnungRules(c);
  }

  // Deduplicate identical findings (same rule + where) that can arise from
  // overlapping contexts, keeping the first occurrence's message.
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const f of c.findings) {
    const key = `${f.rule}|${f.where ?? ""}|${f.hint ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(f);
  }

  const errors = findings.filter((f) => f.severity === "fatal").length;
  const warnings = findings.length - errors;
  return { ok: errors === 0, errors, warnings, findings, rulesApplied: RULES_IMPLEMENTED };
}
