import { describe, expect, it } from "vitest";
import { reviewListing, type LlmCall } from "@/lib/reviewer";
import { extractJson, verifyCitations } from "@/lib/findings";
import { mockReview } from "@/lib/mockReviewer";
import { retrieveSections } from "@/lib/retrieval";
import type { Listing } from "@/lib/types";

const listing: Listing = {
  id: 1,
  title: "BEST Water Bottle!!! Unbeatable",
  description:
    "Amazing bottle with lifetime warranty. Keeps drinks cold for 48 hours. Call me 9876543210 for deals.",
  category: "Home & Kitchen",
  price: "24.99",
  attributes: {},
  seller: "AquaGear",
  tags: [],
};

const finding = (over: Record<string, unknown> = {}) => ({
  field: "title",
  severity: "major",
  issueType: "misleading",
  explanation: "Superlative claim cannot be verified.",
  policyCitation: "P-2.1",
  suggestion: "Water Bottle",
  unverifiableClaim: true,
  assumption: null,
  ...over,
});

describe("extractJson", () => {
  it("handles code fences and surrounding prose", () => {
    expect(extractJson('Sure:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('text {"a":2} more')).toEqual({ a: 2 });
  });
  it("throws when there is no JSON", () => {
    expect(() => extractJson("nothing here")).toThrow();
  });
});

describe("verifyCitations", () => {
  const retrieved = retrieveSections(listing);
  it("keeps findings that cite retrieved sections", () => {
    const r = verifyCitations([finding() as never], retrieved);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
  });
  it("drops invented section ids", () => {
    const r = verifyCitations([finding({ policyCitation: "P-99.9" }) as never], retrieved);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/unknown policy section/);
  });
  it("drops real sections that were not retrieved", () => {
    const limited = retrieved.filter((s) => s.id !== "P-1.2");
    const r = verifyCitations([finding({ policyCitation: "P-1.2" }) as never], limited);
    expect(r.rejected[0].reason).toMatch(/not retrieved/);
  });
  it("normalizes citation case and whitespace", () => {
    const r = verifyCitations([finding({ policyCitation: " p-2.1 " }) as never], retrieved);
    expect(r.accepted[0].policyCitation).toBe("P-2.1");
  });
});

describe("mockReview", () => {
  it("flags hype, absolute claims, contact info, and missing attributes", () => {
    const cites = mockReview(listing).map((f) => f.policyCitation);
    expect(cites).toEqual(expect.arrayContaining(["P-2.1", "P-2.2", "P-5.1", "P-3.2", "B-1.2"]));
  });
  it("returns nothing serious for a clean listing", () => {
    const clean: Listing = {
      ...listing,
      title: "Insulated Water Bottle 750ml",
      description:
        "Stainless steel insulated bottle, 750ml. New condition. Includes carry loop and lid.",
      attributes: { material: "stainless steel" },
    };
    expect(mockReview(clean)).toEqual([]);
  });
});

describe("reviewListing (live path with injected LLM)", () => {
  it("accepts valid output and drops hallucinated citations", async () => {
    const llm: LlmCall = async () =>
      JSON.stringify({
        findings: [finding(), finding({ policyCitation: "X-7" })],
      });
    const r = await reviewListing(listing, { llm });
    expect(r.mode).toBe("live");
    expect(r.findings).toHaveLength(1);
    expect(r.droppedCitations).toHaveLength(1);
  });

  it("retries once after malformed output then succeeds", async () => {
    let calls = 0;
    const llm: LlmCall = async () => {
      calls++;
      return calls === 1 ? "not json at all" : JSON.stringify({ findings: [finding()] });
    };
    const r = await reviewListing(listing, { llm });
    expect(calls).toBe(2);
    expect(r.mode).toBe("live");
    expect(r.findings).toHaveLength(1);
  });

  it("falls back to rule-based review with a warning when the model keeps failing", async () => {
    const llm: LlmCall = async () => {
      throw new Error("503 overloaded");
    };
    const r = await reviewListing(listing, { llm });
    expect(r.mode).toBe("mock");
    expect(r.warnings[0]).toMatch(/AI review failed/);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it("rejects schema-invalid findings (bad severity) and falls back", async () => {
    const llm: LlmCall = async () =>
      JSON.stringify({ findings: [finding({ severity: "catastrophic" })] });
    const r = await reviewListing(listing, { llm });
    expect(r.mode).toBe("mock");
  });
});

describe("reviewListing (no key)", () => {
  it("uses mock mode and still runs deterministic checks", async () => {
    const r = await reviewListing(
      { ...listing, price: "$5" },
      { forceMock: true },
    );
    expect(r.mode).toBe("mock");
    expect(r.validationIssues.map((i) => i.rule)).toContain("price-format");
  });
});

describe("mock reviewer citations are always retrievable (no silent drops)", () => {
  it("keeps every finding the rule-based reviewer produces on the sample batch", async () => {
    const { SAMPLE_LISTINGS } = await import("@/lib/sample");
    const { normalizeInput } = await import("@/lib/store");
    for (const raw of SAMPLE_LISTINGS) {
      const r = await reviewListing(normalizeInput(raw), { forceMock: true });
      expect(r.droppedCitations, `dropped for "${raw.title}"`).toEqual([]);
    }
  });
});

describe("mock reviewer: rewrite quality and extra rules", () => {
  it("removes all hype and punctuation from a title suggestion", () => {
    const f = mockReview({ ...listing, title: "BEST Water Bottle EVER!!! Unbeatable Price" }).find(
      (x) => x.field === "title" && x.policyCitation === "P-2.1",
    )!;
    expect(f.suggestion).toBe("Water Bottle Price");
  });
  it("flags guaranteed business outcomes for services", () => {
    const cites = mockReview({
      ...listing,
      category: "Services",
      description: "I guarantee 10x more customers and top Google ranking within a month.",
    }).map((f) => f.policyCitation);
    expect(cites).toContain("P-4.2");
  });
  it("flags vague compatibility", () => {
    const f = mockReview({ ...listing, description: "Earbuds that work with most devices. Used." }).find(
      (x) => x.policyCitation === "P-3.3",
    );
    expect(f?.issueType).toBe("unclear");
  });
});
