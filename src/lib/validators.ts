import {
  SUPPORTED_CATEGORIES,
  type Listing,
  type ValidationIssue,
} from "./types";

export const LIMITS = {
  titleMin: 10,
  titleMax: 80,
  descriptionMin: 50,
  descriptionMax: 2000,
  priceMax: 1_000_000,
} as const;

// Digits with optional thousands separators, optional 1-2 decimals. No currency symbols.
const PRICE_RE = /^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/;

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePrice(raw: string): number | null {
  const trimmed = (raw ?? "").trim();
  if (!PRICE_RE.test(trimmed)) return null;
  return Number(trimmed.replace(/,/g, ""));
}

export function validateRequiredFields(l: Listing): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const req: [keyof Listing, string][] = [
    ["title", "title"],
    ["description", "description"],
    ["category", "category"],
    ["price", "price"],
    ["seller", "seller"],
  ];
  for (const [key, field] of req) {
    const v = l[key];
    if (typeof v !== "string" || v.trim() === "") {
      issues.push({
        rule: "required-field",
        field: field as ValidationIssue["field"],
        severity: "critical",
        message: `${field} is required.`,
      });
    }
  }
  return issues;
}

export function validatePrice(l: Listing): ValidationIssue[] {
  if (!l.price || l.price.trim() === "") return []; // reported as required
  const value = parsePrice(l.price);
  if (value === null) {
    return [
      {
        rule: "price-format",
        field: "price",
        severity: "critical",
        message:
          "Price must be a plain number such as 1299 or 1,299.50 (no currency symbols or text).",
      },
    ];
  }
  if (value <= 0) {
    return [
      {
        rule: "price-range",
        field: "price",
        severity: "critical",
        message: "Price must be greater than zero.",
      },
    ];
  }
  if (value > LIMITS.priceMax) {
    return [
      {
        rule: "price-range",
        field: "price",
        severity: "major",
        message: `Price exceeds the supported maximum of ${LIMITS.priceMax}.`,
      },
    ];
  }
  return [];
}

export function validateLengths(l: Listing): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const t = (l.title ?? "").trim();
  const d = (l.description ?? "").trim();
  if (t) {
    if (t.length < LIMITS.titleMin)
      issues.push({
        rule: "title-length",
        field: "title",
        severity: "major",
        message: `Title is too short (${t.length} chars, minimum ${LIMITS.titleMin}).`,
      });
    if (t.length > LIMITS.titleMax)
      issues.push({
        rule: "title-length",
        field: "title",
        severity: "major",
        message: `Title is too long (${t.length} chars, maximum ${LIMITS.titleMax}).`,
      });
  }
  if (d) {
    if (d.length < LIMITS.descriptionMin)
      issues.push({
        rule: "description-length",
        field: "description",
        severity: "major",
        message: `Description is too short (${d.length} chars, minimum ${LIMITS.descriptionMin}).`,
      });
    if (d.length > LIMITS.descriptionMax)
      issues.push({
        rule: "description-length",
        field: "description",
        severity: "major",
        message: `Description is too long (${d.length} chars, maximum ${LIMITS.descriptionMax}).`,
      });
  }
  return issues;
}

export function validateCategory(l: Listing): ValidationIssue[] {
  if (!l.category || l.category.trim() === "") return [];
  const ok = (SUPPORTED_CATEGORIES as readonly string[]).includes(l.category);
  return ok
    ? []
    : [
        {
          rule: "category-supported",
          field: "category",
          severity: "critical",
          message: `Category "${l.category}" is not supported. Supported: ${SUPPORTED_CATEGORIES.join(", ")}.`,
        },
      ];
}

/** Duplicate = same seller and same normalized title, or near-identical description. */
export function listingFingerprint(l: Listing): string {
  return `${normalizeText(l.seller ?? "")}|${normalizeText(l.title ?? "")}`;
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeText(s).split(" ").filter((w) => w.length > 2));
}

export function jaccard(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function detectDuplicates(
  l: Listing,
  others: Listing[],
  threshold = 0.85,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fp = listingFingerprint(l);
  for (const o of others) {
    if (o.id !== undefined && o.id === l.id) continue;
    if (listingFingerprint(o) === fp && fp !== "|") {
      issues.push({
        rule: "duplicate-listing",
        field: "title",
        severity: "major",
        message: `Duplicate of listing #${o.id ?? "?"}: same seller and title.`,
      });
      continue;
    }
    if (
      normalizeText(o.seller ?? "") === normalizeText(l.seller ?? "") &&
      jaccard(o.description ?? "", l.description ?? "") >= threshold
    ) {
      issues.push({
        rule: "duplicate-listing",
        field: "description",
        severity: "major",
        message: `Description is near-identical to listing #${o.id ?? "?"} from the same seller.`,
      });
    }
  }
  return issues;
}

export function runDeterministicChecks(
  l: Listing,
  others: Listing[] = [],
): ValidationIssue[] {
  return [
    ...validateRequiredFields(l),
    ...validatePrice(l),
    ...validateLengths(l),
    ...validateCategory(l),
    ...detectDuplicates(l, others),
  ];
}
