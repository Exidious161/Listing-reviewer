import type { RawFinding } from "./findings";
import type { Listing } from "./types";

const HYPE =
  /\b(best|ever|unbeatable|amazing|incredible|perfect|must-have|number one|guaranteed)\b|#1/gi;

function stripHype(text: string): string {
  return text
    .replace(HYPE, "")
    .replace(/!+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function titleCase(text: string): string {
  return text.replace(
    /\b([a-z])([a-z]*)/gi,
    (_m, first: string, rest: string) => first.toUpperCase() + rest.toLowerCase(),
  );
}

/**
 * Deterministic rule-based reviewer. Used when no ANTHROPIC_API_KEY is set,
 * in tests, and as an offline demo mode. It produces the same finding shape as
 * the live model so the rest of the pipeline is exercised identically.
 */
export function mockReview(l: Listing): RawFinding[] {
  const out: RawFinding[] = [];
  const title = l.title ?? "";
  const desc = l.description ?? "";
  const all = `${title} ${desc}`.toLowerCase();

  const brandWords = /(replica|knockoff|knock-off|1:1|fake|copy of)/i;
  if (brandWords.test(all)) {
    out.push({
      field: brandWords.test(title) ? "title" : "description",
      severity: "critical",
      issueType: "prohibited",
      explanation:
        "Wording suggests a counterfeit or replica of a branded product, which is not allowed.",
      policyCitation: "P-1.2",
      suggestion: null,
      unverifiableClaim: false,
      assumption: null,
    });
  }

  if (/(firearm|ammunition|explosive|gun parts)/i.test(all)) {
    out.push({
      field: "title",
      severity: "critical",
      issueType: "prohibited",
      explanation: "Weapons, ammunition, and explosives cannot be listed.",
      policyCitation: "P-1.1",
      suggestion: null,
      unverifiableClaim: false,
      assumption: null,
    });
  }

  if (/(cures?|treats?|prevents?|diagnos|heals?)\b/i.test(all)) {
    out.push({
      field: "description",
      severity: "critical",
      issueType: "prohibited",
      explanation:
        "Medical outcome claims (cure/treat/prevent) are not permitted for marketplace products.",
      policyCitation: "P-1.3",
      suggestion: desc
        .replace(/\b(cures?|treats?|prevents?|heals?)\b[^.]*\./gi, "")
        .trim() || null,
      unverifiableClaim: true,
      assumption: null,
    });
  }

  const superlative = /\b(best|#1|number one|unbeatable|amazing|must-have|guaranteed)\b/i;
  const sm = all.match(superlative);
  if (sm) {
    const inTitle = superlative.test(title);
    const source = inTitle ? title : desc;
    out.push({
      field: inTitle ? "title" : "description",
      severity: "major",
      issueType: "misleading",
      explanation: `"${sm[0]}" is a superlative or hype claim that cannot be verified.`,
      policyCitation: "P-2.1",
      suggestion: inTitle ? titleCase(stripHype(source)) : stripHype(source),
      unverifiableClaim: true,
      assumption: null,
    });
  }

  const absolute = /(lifetime warranty|100% safe|works for everyone|never breaks|certified)/i;
  const am = all.match(absolute);
  if (am) {
    out.push({
      field: "description",
      severity: "major",
      issueType: "unverifiable",
      explanation: `"${am[0]}" is an absolute claim with no stated basis or terms.`,
      policyCitation: "P-2.2",
      suggestion: desc.replace(absolute, "backed by the seller's stated warranty terms"),
      unverifiableClaim: true,
      assumption: "Assumes the seller can document the claim; none was provided.",
    });
  }

  const letters = title.replace(/[^A-Za-z]/g, "");
  const upper = title.replace(/[^A-Z]/g, "");
  if (letters.length > 6 && upper.length / letters.length > 0.6) {
    out.push({
      field: "title",
      severity: "minor",
      issueType: "style",
      explanation: "Title is mostly capital letters; use title case.",
      policyCitation: "B-1.1",
      suggestion: title
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      unverifiableClaim: false,
      assumption: null,
    });
  }

  if (/!{2,}/.test(all) || /\$\d/.test(title)) {
    out.push({
      field: "title",
      severity: "minor",
      issueType: "style",
      explanation:
        "Titles should not include promotional punctuation or prices.",
      policyCitation: "B-1.2",
      suggestion: title.replace(/!+/g, "").replace(/\$\d[\d,.]*/g, "").replace(/\s{2,}/g, " ").trim(),
      unverifiableClaim: false,
      assumption: null,
    });
  }

  if (/(whatsapp|call me|\b\d{10}\b|@\w+\.\w+|https?:\/\/)/i.test(desc)) {
    out.push({
      field: "description",
      severity: "major",
      issueType: "prohibited",
      explanation:
        "Descriptions must not include personal contact details or external links.",
      policyCitation: "P-5.1",
      suggestion: desc
        .replace(/(https?:\/\/\S+|\b\d{10}\b|\S+@\S+\.\S+)/g, "")
        .replace(/\s{2,}/g, " ")
        .trim(),
      unverifiableClaim: false,
      assumption: null,
    });
  }

  if ((l.tags ?? []).length > 8) {
    out.push({
      field: "tags",
      severity: "minor",
      issueType: "style",
      explanation: "More than eight tags counts as keyword stuffing.",
      policyCitation: "P-5.2",
      suggestion: l.tags.slice(0, 8).join(", "),
      unverifiableClaim: false,
      assumption: null,
    });
  }

  const attrKeys = Object.keys(l.attributes ?? {}).map((k) => k.toLowerCase());
  const needs: Record<string, string[]> = {
    "Home & Kitchen": ["material"],
    "Clothing & Accessories": ["size", "material"],
    Electronics: ["model"],
    Services: ["duration"],
  };
  const missing = (needs[l.category] ?? []).filter((k) => !attrKeys.includes(k));
  if (missing.length) {
    out.push({
      field: "attributes",
      severity: "major",
      issueType: "incomplete",
      explanation: `Missing required attribute(s) for ${l.category}: ${missing.join(", ")}.`,
      policyCitation: "P-3.2",
      suggestion: null,
      unverifiableClaim: false,
      assumption: null,
    });
  }

  if (desc.length > 0 && !/(new|used|refurbished|condition)/i.test(desc)) {
    out.push({
      field: "description",
      severity: "minor",
      issueType: "incomplete",
      explanation: "Description does not state the item's condition.",
      policyCitation: "P-3.1",
      suggestion: `${desc.trim()} Condition: new.`,
      unverifiableClaim: false,
      assumption: "Assumes the item is new; the seller must confirm.",
    });
  }

  if (/(guarantee\w*|top (google )?rank\w*|\b\d+x (more )?(customers|sales|traffic|income|revenue))/i.test(all) && (l.category === "Services" || /rank|customers|income|sales/i.test(all))) {
    out.push({
      field: "description",
      severity: "critical",
      issueType: "prohibited",
      explanation:
        "Promising guaranteed business outcomes (rankings, customers, income) is not permitted for services; describe the work performed instead.",
      policyCitation: "P-4.2",
      suggestion: null,
      unverifiableClaim: true,
      assumption: null,
    });
  }

  if (/(works? with (most|all|any)|compatible with (most|all|any)|fits (most|all|any))/i.test(desc)) {
    out.push({
      field: "description",
      severity: "major",
      issueType: "unclear",
      explanation:
        "Compatibility is vague. List the specific models or devices this item works with.",
      policyCitation: "P-3.3",
      suggestion: null,
      unverifiableClaim: false,
      assumption: null,
    });
  }

  if (/(contact me|call for price|price on request|ask for (a )?(price|discount)|secret discount)/i.test(all)) {
    out.push({
      field: "description",
      severity: "major",
      issueType: "misleading",
      explanation:
        "Pricing must be stated in the price field; do not use contact-for-price or hidden-discount wording.",
      policyCitation: "P-2.3",
      suggestion: null,
      unverifiableClaim: false,
      assumption: null,
    });
  }

  return out;
}
