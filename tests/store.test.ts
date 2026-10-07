import { beforeEach, describe, expect, it } from "vitest";
import { openDb, prepare, type Database } from "@/lib/db";
import { MAX_BATCH, Store, StoreError } from "@/lib/store";

let store: Store;
let rawDb: Database;

const bad = {
  title: "BEST Water Bottle!!! Unbeatable",
  description:
    "Amazing bottle with lifetime warranty. Keeps drinks cold for 48 hours. New condition.",
  category: "Home & Kitchen",
  price: "24.99",
  attributes: {},
  seller: "AquaGear",
  tags: [],
};

beforeEach(async () => {
  rawDb = await openDb(":memory:");
  store = new Store(rawDb);
});

describe("workflow", () => {
  it("creates, reviews, and records history", async () => {
    const l = await store.createListing(bad);
    const r = await store.runReview(l.id, { forceMock: true });
    expect(r.findings.length).toBeGreaterThan(0);
    expect((await store.history(l.id)).map((h) => h.event)).toEqual(["created", "reviewed"]);
  });

  it("approve applies the suggestion to the revised version, original untouched", async () => {
    const l = await store.createListing(bad);
    const r = await store.runReview(l.id, { forceMock: true });
    const f = r.findings.find((x) => x.field === "title" && x.suggestion)!;
    const { listing } = await store.decide(r.id, f.id, "approved", { actor: "avnish" });
    expect(listing.title).toBe(bad.title);
    expect(listing.revised.title).toBe(f.suggestion);
    const h = (await store.history(l.id)).at(-1)!;
    expect(h).toMatchObject({ event: "approved", field: "title", actor: "avnish", before: bad.title });
  });

  it("edit stores the reviewer's own text", async () => {
    const l = await store.createListing(bad);
    const r = await store.runReview(l.id, { forceMock: true });
    const f = r.findings.find((x) => x.field === "title")!;
    const { listing } = await store.decide(r.id, f.id, "edited", { editedValue: "Insulated Water Bottle 750ml" });
    expect(listing.revised.title).toBe("Insulated Water Bottle 750ml");
  });

  it("reject leaves the value unchanged but is recorded", async () => {
    const l = await store.createListing(bad);
    const r = await store.runReview(l.id, { forceMock: true });
    const f = r.findings[0];
    const { listing, decisions } = await store.decide(r.id, f.id, "rejected");
    expect(listing.revised).toEqual({});
    expect(decisions[f.id].decision).toBe("rejected");
  });

  it("revert removes a revision and returns the finding to pending", async () => {
    const l = await store.createListing(bad);
    const r = await store.runReview(l.id, { forceMock: true });
    const f = r.findings.find((x) => x.field === "title" && x.suggestion)!;
    await store.decide(r.id, f.id, "approved");
    const { listing, decisions } = await store.decide(r.id, f.id, "reverted");
    expect(listing.revised.title).toBeUndefined();
    expect(decisions[f.id].decision).toBe("pending");
  });

  it("refuses to approve a finding with no suggestion and rejects empty edits", async () => {
    const l = await store.createListing({ ...bad, title: "Replica designer handbag copy" });
    const r = await store.runReview(l.id, { forceMock: true });
    const f = r.findings.find((x) => x.suggestion === null)!;
    await expect(store.decide(r.id, f.id, "approved")).rejects.toThrow(StoreError);
    await expect(store.decide(r.id, f.id, "edited", { editedValue: "  " })).rejects.toThrow(StoreError);
  });

  it("blocks finalizing until critical/major findings have decisions", async () => {
    const l = await store.createListing(bad);
    const r = await store.runReview(l.id, { forceMock: true });
    await expect(store.finalize(l.id)).rejects.toThrow(/need a decision/);
    for (const f of r.findings) {
      if (f.severity === "critical" || f.severity === "major") await store.decide(r.id, f.id, "rejected");
    }
    expect((await store.finalize(l.id)).status).toBe("finalized");
  });
});

describe("history is append-only", () => {
  it("rejects UPDATE and DELETE at the database level", async () => {
    const l = await store.createListing(bad);
    await expect(
      prepare(rawDb, "UPDATE history SET actor='x' WHERE listing_id=?").run(l.id),
    ).rejects.toThrow(/append-only/);
    await expect(
      prepare(rawDb, "DELETE FROM history WHERE listing_id=?").run(l.id),
    ).rejects.toThrow(/append-only/);
  });
});

describe("batch", () => {
  it("processes several listings and flags duplicates", async () => {
    const out = await store.runBatch([bad, bad, { ...bad, title: "Another Distinct Steel Flask 1L", description: "Totally different words here about a flask with a cork stopper, hand wash only." }], { forceMock: true });
    expect(out).toHaveLength(3);
    const second = out[1].review!;
    expect(second.validationIssues.some((i) => i.rule === "duplicate-listing")).toBe(true);
    expect(out[2].review!.validationIssues.some((i) => i.rule === "duplicate-listing")).toBe(false);
  });
  it("enforces size limits", async () => {
    await expect(store.runBatch([])).rejects.toThrow(/at least one/);
    await expect(store.runBatch(Array(MAX_BATCH + 1).fill(bad))).rejects.toThrow(/limited/);
  });
  it("keeps going when one item fails", async () => {
    const out = await store.runBatch([bad, bad], {
      llm: async () => {
        throw new Error("boom");
      },
    });
    expect(out.every((o) => o.review !== null)).toBe(true); // fell back to rule-based
    expect(out[0].review!.warnings[0]).toMatch(/AI review failed/);
  });
});
