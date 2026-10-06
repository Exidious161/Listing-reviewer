import { describe, expect, it } from "vitest";
import {
  detectDuplicates,
  parsePrice,
  runDeterministicChecks,
  validateCategory,
  validateLengths,
  validatePrice,
  validateRequiredFields,
} from "@/lib/validators";
import type { Listing } from "@/lib/types";

const good: Listing = {
  id: 1,
  title: "Stainless Steel Water Bottle 750ml",
  description:
    "Double-wall insulated bottle, 750ml capacity, BPA-free lid, dishwasher-safe body. Includes carry loop.",
  category: "Home & Kitchen",
  price: "24.99",
  attributes: { material: "stainless steel", capacity: "750ml" },
  seller: "AquaGear",
  tags: ["bottle"],
};

describe("parsePrice", () => {
  it("accepts plain and formatted numbers", () => {
    expect(parsePrice("24.99")).toBe(24.99);
    expect(parsePrice("1,299.50")).toBe(1299.5);
    expect(parsePrice("100")).toBe(100);
  });
  it("rejects currency symbols, text, and bad separators", () => {
    expect(parsePrice("$24.99")).toBeNull();
    expect(parsePrice("free")).toBeNull();
    expect(parsePrice("12.999")).toBeNull();
    expect(parsePrice("1,29")).toBeNull();
    expect(parsePrice("")).toBeNull();
  });
});

describe("required fields", () => {
  it("passes a complete listing", () => {
    expect(validateRequiredFields(good)).toEqual([]);
  });
  it("flags each missing or blank field", () => {
    const issues = validateRequiredFields({
      ...good,
      title: "  ",
      seller: "",
    });
    expect(issues.map((i) => i.field).sort()).toEqual(["seller", "title"]);
    expect(issues.every((i) => i.severity === "critical")).toBe(true);
  });
});

describe("price", () => {
  it("flags bad format", () => {
    expect(validatePrice({ ...good, price: "$5" })[0].rule).toBe("price-format");
  });
  it("flags zero and above-max", () => {
    expect(validatePrice({ ...good, price: "0" })[0].rule).toBe("price-range");
    expect(validatePrice({ ...good, price: "2000000" })[0].rule).toBe(
      "price-range",
    );
  });
  it("does not double-report an empty price", () => {
    expect(validatePrice({ ...good, price: "" })).toEqual([]);
  });
});

describe("lengths", () => {
  it("flags short and long titles", () => {
    expect(validateLengths({ ...good, title: "Bottle" })[0].rule).toBe(
      "title-length",
    );
    expect(
      validateLengths({ ...good, title: "x".repeat(81) })[0].message,
    ).toMatch(/too long/);
  });
  it("flags short and long descriptions", () => {
    expect(validateLengths({ ...good, description: "Nice." })[0].rule).toBe(
      "description-length",
    );
    expect(
      validateLengths({ ...good, description: "x".repeat(2001) })[0].message,
    ).toMatch(/too long/);
  });
  it("accepts boundary values", () => {
    expect(
      validateLengths({
        ...good,
        title: "x".repeat(10),
        description: "y".repeat(50),
      }),
    ).toEqual([]);
  });
});

describe("category", () => {
  it("accepts supported and rejects unsupported", () => {
    expect(validateCategory(good)).toEqual([]);
    expect(validateCategory({ ...good, category: "Firearms" })[0].rule).toBe(
      "category-supported",
    );
  });
});

describe("duplicates", () => {
  it("detects same seller + normalized title", () => {
    const other = { ...good, id: 2, title: "stainless steel water bottle 750ML!" };
    expect(detectDuplicates(good, [other])[0].rule).toBe("duplicate-listing");
  });
  it("detects near-identical descriptions from the same seller", () => {
    const other = { ...good, id: 2, title: "Insulated Flask Large Size" };
    expect(detectDuplicates(good, [other]).length).toBe(1);
  });
  it("ignores itself and other sellers", () => {
    expect(detectDuplicates(good, [good])).toEqual([]);
    expect(detectDuplicates(good, [{ ...good, id: 9, seller: "Other" }])).toEqual(
      [],
    );
  });
});

describe("runDeterministicChecks", () => {
  it("returns nothing for a clean listing", () => {
    expect(runDeterministicChecks(good, [])).toEqual([]);
  });
  it("aggregates multiple problems", () => {
    const issues = runDeterministicChecks(
      { ...good, title: "Hi", price: "abc", category: "Weapons" },
      [],
    );
    const rules = issues.map((i) => i.rule);
    expect(rules).toContain("title-length");
    expect(rules).toContain("price-format");
    expect(rules).toContain("category-supported");
  });
});
