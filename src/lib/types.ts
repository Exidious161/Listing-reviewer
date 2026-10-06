export const SUPPORTED_CATEGORIES = [
  "Electronics",
  "Home & Kitchen",
  "Clothing & Accessories",
  "Books & Media",
  "Sports & Outdoors",
  "Beauty & Personal Care",
  "Toys & Games",
  "Services",
] as const;

export type Category = (typeof SUPPORTED_CATEGORIES)[number];

export interface Listing {
  id?: number;
  title: string;
  description: string;
  category: string;
  price: string; // kept as string so format errors can be detected
  attributes: Record<string, string>;
  seller: string;
  tags: string[];
}

export type Severity = "critical" | "major" | "minor" | "info";

export type IssueType =
  | "prohibited"
  | "misleading"
  | "unclear"
  | "incomplete"
  | "unverifiable"
  | "style";

export type ReviewField =
  | "title"
  | "description"
  | "category"
  | "price"
  | "attributes"
  | "seller"
  | "tags";

export interface ValidationIssue {
  rule: string;
  field: ReviewField;
  severity: Severity;
  message: string;
}

export interface Finding {
  id: string;
  field: ReviewField;
  severity: Severity;
  issueType: IssueType;
  explanation: string;
  policyCitation: string; // e.g. "P-4.2"
  suggestion: string | null; // replacement text for the field, if any
  unverifiableClaim: boolean;
  assumption: string | null;
  source: "ai" | "rule";
}

export type FindingDecision = "pending" | "approved" | "edited" | "rejected";

export interface PolicySection {
  id: string; // e.g. "P-4.2"
  doc: "policy" | "brand";
  title: string;
  text: string;
}
