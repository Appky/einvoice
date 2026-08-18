/** Validation orchestrator: run all rule groups over a semantic model. */

import { Invoice } from "./model.js";
import { Ctx, Finding, ValidationResult } from "./rules-util.js";
import { coreRules } from "./rules-core.js";
import { vatCategoryRules } from "./rules-vat.js";
import { codeListRules } from "./rules-codes.js";

export type { Finding, ValidationResult, Severity } from "./rules-util.js";

/** Approximate number of distinct EN 16931 rules evaluated by this engine. */
export const RULES_IMPLEMENTED = 165;

export function validate(inv: Invoice): ValidationResult {
  const c = new Ctx(inv);
  coreRules(c);
  vatCategoryRules(c);
  codeListRules(c);

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
