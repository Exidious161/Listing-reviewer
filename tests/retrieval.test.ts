import { describe, expect, it } from "vitest";
import { retrieveSections } from "@/lib/retrieval";
import { POLICY_IDS, POLICY_SECTIONS } from "@/lib/policy";
import type { Listing } from "@/lib/types";

const base: Listing = {
  title: "Bottle",
  description: "A bottle.",
  category: "Home & Kitchen",
  price: "10",
  attributes: {},
  seller: "S",
  tags: [],
};

describe("policy corpus", () => {
  it("has unique ids and both documents", () => {
    expect(POLICY_IDS.size).toBe(POLICY_SECTIONS.length);
    expect(POLICY_SECTIONS.some((s) => s.doc === "brand")).toBe(true);
    expect(POLICY_SECTIONS.some((s) => s.doc === "policy")).toBe(true);
  });
});

describe("retrieveSections", () => {
  it("always includes core style and accuracy sections", () => {
    const ids = retrieveSections(base).map((s) => s.id);
    for (const id of ["B-1.1", "P-2.1", "P-2.2"]) expect(ids).toContain(id);
  });
  it("surfaces counterfeit guidance for replica brand listings", () => {
    const ids = retrieveSections({
      ...base,
      title: "Replica designer handbag copy of famous brand",
      description: "1:1 knockoff with brand logo",
    }).map((s) => s.id);
    expect(ids).toContain("P-1.2");
  });
  it("surfaces weapons guidance for ammunition", () => {
    const ids = retrieveSections({
      ...base,
      title: "Ammunition and explosives bundle",
      description: "firearms parts and ammunition",
    }).map((s) => s.id);
    expect(ids).toContain("P-1.1");
  });
  it("is deterministic and returns no duplicates", () => {
    const a = retrieveSections(base).map((s) => s.id);
    const b = retrieveSections(base).map((s) => s.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("retrieval signals (regression: valid findings must not be dropped for recall)", () => {
  const ids = (l: Partial<Listing>) => retrieveSections({ ...base, ...l }).map((s) => s.id);
  it("retrieves contact-info policy for phone numbers", () => {
    expect(ids({ description: "Call me 9876543210 for deals" })).toContain("P-5.1");
  });
  it("retrieves keyword-stuffing policy when there are more than eight tags", () => {
    expect(ids({ tags: Array.from({ length: 10 }, (_, i) => `t${i}`) })).toContain("P-5.2");
    expect(ids({ tags: ["a", "b"] })).not.toContain("P-5.2");
  });
  it("retrieves health-claims policy for cure language", () => {
    expect(ids({ description: "This tonic cures anxiety and prevents cancer" })).toContain("P-1.3");
  });
  it("retrieves pricing policy for 'contact me' prices in text", () => {
    expect(ids({ description: "price: contact me" })).toContain("P-2.3");
  });
});
