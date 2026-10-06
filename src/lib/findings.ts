import { z } from "zod";
import { POLICY_IDS } from "./policy";
import type { Finding, PolicySection } from "./types";

export const FindingSchema = z.object({
  field: z.enum([
    "title",
    "description",
    "category",
    "price",
    "attributes",
    "seller",
    "tags",
  ]),
  severity: z.enum(["critical", "major", "minor", "info"]),
  issueType: z.enum([
    "prohibited",
    "misleading",
    "unclear",
    "incomplete",
    "unverifiable",
    "style",
  ]),
  explanation: z.string().min(5).max(600),
  policyCitation: z.string().min(1),
  suggestion: z.string().max(2000).nullable(),
  unverifiableClaim: z.boolean(),
  assumption: z.string().max(400).nullable(),
});

export const ReviewOutputSchema = z.object({
  findings: z.array(FindingSchema).max(20),
});

export type RawFinding = z.infer<typeof FindingSchema>;

export interface CitationCheckResult {
  accepted: RawFinding[];
  rejected: { finding: RawFinding; reason: string }[];
}

/**
 * Core grounding guarantee: a finding is only kept if it cites a policy section
 * that exists AND was actually retrieved for this listing. This stops the model
 * from inventing or misattributing policy references.
 */
export function verifyCitations(
  findings: RawFinding[],
  retrieved: PolicySection[],
): CitationCheckResult {
  const retrievedIds = new Set(retrieved.map((s) => s.id));
  const accepted: RawFinding[] = [];
  const rejected: CitationCheckResult["rejected"] = [];
  for (const f of findings) {
    const id = f.policyCitation.trim().toUpperCase();
    if (!POLICY_IDS.has(id)) {
      rejected.push({ finding: f, reason: `unknown policy section "${f.policyCitation}"` });
    } else if (!retrievedIds.has(id)) {
      rejected.push({ finding: f, reason: `section ${id} was not retrieved for this listing` });
    } else {
      accepted.push({ ...f, policyCitation: id });
    }
  }
  return { accepted, rejected };
}

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2, info: 3 } as const;

export function toFindings(raw: RawFinding[], source: Finding["source"]): Finding[] {
  return raw
    .map((f, i) => ({ ...f, id: `${source}-${i + 1}`, source }) as Finding)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Extracts the first JSON object from model text (handles code fences / prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start)
    throw new Error("No JSON object found in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}
