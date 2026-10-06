import type Database from "better-sqlite3";
import { reviewListing, type ReviewOptions, type ReviewResult } from "./reviewer";
import { log } from "./logger";
import type { Finding, FindingDecision, Listing, ValidationIssue } from "./types";

export const MAX_BATCH = 10;
const REVISABLE = ["title", "description", "category", "price", "seller", "tags"] as const;
type Revisable = (typeof REVISABLE)[number];

export interface StoredListing extends Listing {
  id: number;
  revised: Partial<Record<Revisable, string>>;
  status: string;
  createdAt: string;
}

export interface StoredReview {
  id: number;
  listingId: number;
  mode: "live" | "mock";
  validationIssues: ValidationIssue[];
  findings: Finding[];
  retrievedSections: string[];
  warnings: string[];
  dropped: { reason: string; explanation: string }[];
  createdAt: string;
}

export interface HistoryEntry {
  id: number;
  listingId: number;
  reviewId: number | null;
  findingId: string | null;
  event: string;
  field: string | null;
  before: string | null;
  after: string | null;
  actor: string;
  createdAt: string;
}

const now = () => new Date().toISOString();

type Row = Record<string, unknown>;

function mapListing(r: Row): StoredListing {
  return {
    id: r.id as number,
    title: r.title as string,
    description: r.description as string,
    category: r.category as string,
    price: r.price as string,
    attributes: JSON.parse(r.attributes as string),
    seller: r.seller as string,
    tags: JSON.parse(r.tags as string),
    revised: JSON.parse(r.revised as string),
    status: r.status as string,
    createdAt: r.created_at as string,
  };
}

function mapReview(r: Row): StoredReview {
  return {
    id: r.id as number,
    listingId: r.listing_id as number,
    mode: r.mode as "live" | "mock",
    validationIssues: JSON.parse(r.validation as string),
    findings: JSON.parse(r.findings as string),
    retrievedSections: JSON.parse(r.retrieved as string),
    warnings: JSON.parse(r.warnings as string),
    dropped: JSON.parse(r.dropped as string),
    createdAt: r.created_at as string,
  };
}

function mapHistory(r: Row): HistoryEntry {
  return {
    id: r.id as number,
    listingId: r.listing_id as number,
    reviewId: (r.review_id as number) ?? null,
    findingId: (r.finding_id as string) ?? null,
    event: r.event as string,
    field: (r.field as string) ?? null,
    before: (r.before_value as string) ?? null,
    after: (r.after_value as string) ?? null,
    actor: r.actor as string,
    createdAt: r.created_at as string,
  };
}

export class StoreError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function normalizeInput(x: Partial<Listing>): Listing {
  const attrs: Record<string, string> = {};
  if (x.attributes && typeof x.attributes === "object")
    for (const [k, v] of Object.entries(x.attributes))
      attrs[String(k).trim()] = String(v ?? "").trim();
  const tags = Array.isArray(x.tags)
    ? x.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  return {
    title: String(x.title ?? ""),
    description: String(x.description ?? ""),
    category: String(x.category ?? ""),
    price: String(x.price ?? ""),
    attributes: attrs,
    seller: String(x.seller ?? ""),
    tags,
  };
}

export class Store {
  constructor(private db: Database.Database) {}

  private addHistory(e: {
    listingId: number;
    reviewId?: number | null;
    findingId?: string | null;
    event: string;
    field?: string | null;
    before?: string | null;
    after?: string | null;
    actor: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO history (listing_id, review_id, finding_id, event, field, before_value, after_value, actor, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        e.listingId,
        e.reviewId ?? null,
        e.findingId ?? null,
        e.event,
        e.field ?? null,
        e.before ?? null,
        e.after ?? null,
        e.actor,
        now(),
      );
  }

  createListing(input: Partial<Listing>, actor = "seller"): StoredListing {
    const l = normalizeInput(input);
    const info = this.db
      .prepare(
        `INSERT INTO listings (title, description, category, price, attributes, seller, tags, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        l.title,
        l.description,
        l.category,
        l.price,
        JSON.stringify(l.attributes),
        l.seller,
        JSON.stringify(l.tags),
        now(),
      );
    const id = Number(info.lastInsertRowid);
    this.addHistory({ listingId: id, event: "created", actor });
    return this.getListing(id)!;
  }

  getListing(id: number): StoredListing | null {
    const r = this.db.prepare("SELECT * FROM listings WHERE id = ?").get(id) as Row | undefined;
    return r ? mapListing(r) : null;
  }

  listListings(): StoredListing[] {
    return (this.db.prepare("SELECT * FROM listings ORDER BY id DESC").all() as Row[]).map(mapListing);
  }

  latestReview(listingId: number): StoredReview | null {
    const r = this.db
      .prepare("SELECT * FROM reviews WHERE listing_id = ? ORDER BY id DESC LIMIT 1")
      .get(listingId) as Row | undefined;
    return r ? mapReview(r) : null;
  }

  getReview(id: number): StoredReview | null {
    const r = this.db.prepare("SELECT * FROM reviews WHERE id = ?").get(id) as Row | undefined;
    return r ? mapReview(r) : null;
  }

  history(listingId: number): HistoryEntry[] {
    return (
      this.db
        .prepare("SELECT * FROM history WHERE listing_id = ? ORDER BY id ASC")
        .all(listingId) as Row[]
    ).map(mapHistory);
  }

  /** Decisions made so far on a review: findingId -> latest decision event. */
  decisions(reviewId: number): Record<string, { decision: FindingDecision; value: string | null }> {
    const rows = this.db
      .prepare(
        `SELECT finding_id, event, after_value FROM history
         WHERE review_id = ? AND event IN ('approved','edited','rejected','reverted') ORDER BY id ASC`,
      )
      .all(reviewId) as Row[];
    const out: Record<string, { decision: FindingDecision; value: string | null }> = {};
    for (const r of rows) {
      const id = r.finding_id as string;
      const ev = r.event as string;
      out[id] =
        ev === "reverted"
          ? { decision: "pending", value: null }
          : { decision: ev as FindingDecision, value: (r.after_value as string) ?? null };
    }
    return out;
  }

  async runReview(listingId: number, opts: ReviewOptions = {}, actor = "system"): Promise<StoredReview> {
    const listing = this.getListing(listingId);
    if (!listing) throw new StoreError("Listing not found", 404);
    const others = this.listListings().filter((l) => l.id !== listingId);
    const result: ReviewResult = await reviewListing(listing, { ...opts, others });
    const info = this.db
      .prepare(
        `INSERT INTO reviews (listing_id, mode, validation, findings, retrieved, warnings, dropped, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        listingId,
        result.mode,
        JSON.stringify(result.validationIssues),
        JSON.stringify(result.findings),
        JSON.stringify(result.retrievedSections),
        JSON.stringify(result.warnings),
        JSON.stringify(result.droppedCitations),
        now(),
      );
    const reviewId = Number(info.lastInsertRowid);
    this.db.prepare("UPDATE listings SET status = 'in_review' WHERE id = ?").run(listingId);
    this.addHistory({
      listingId,
      reviewId,
      event: "reviewed",
      after: `${result.findings.length} findings, ${result.validationIssues.length} validation issues (${result.mode})`,
      actor,
    });
    return this.getReview(reviewId)!;
  }

  async runBatch(
    inputs: Partial<Listing>[],
    opts: ReviewOptions = {},
  ): Promise<{ listing: StoredListing; review: StoredReview | null; error?: string }[]> {
    if (!Array.isArray(inputs) || inputs.length === 0)
      throw new StoreError("Batch must contain at least one listing");
    if (inputs.length > MAX_BATCH)
      throw new StoreError(`Batch is limited to ${MAX_BATCH} listings`);
    const out: { listing: StoredListing; review: StoredReview | null; error?: string }[] = [];
    for (const input of inputs) {
      const listing = this.createListing(input);
      try {
        const review = await this.runReview(listing.id, opts);
        out.push({ listing: this.getListing(listing.id)!, review });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("error", "batch.item_failed", { listingId: listing.id, error: msg });
        out.push({ listing, review: null, error: msg });
      }
    }
    return out;
  }

  /** Current value of a field: revised value if present, else the original. */
  private currentValue(l: StoredListing, field: Revisable): string {
    if (l.revised[field] !== undefined) return l.revised[field]!;
    return field === "tags" ? l.tags.join(", ") : (l[field] as string);
  }

  decide(
    reviewId: number,
    findingId: string,
    decision: "approved" | "edited" | "rejected" | "reverted",
    opts: { editedValue?: string; actor?: string } = {},
  ): { listing: StoredListing; decisions: ReturnType<Store["decisions"]> } {
    const review = this.getReview(reviewId);
    if (!review) throw new StoreError("Review not found", 404);
    const finding = review.findings.find((f) => f.id === findingId);
    if (!finding) throw new StoreError("Finding not found", 404);
    const listing = this.getListing(review.listingId)!;
    const actor = opts.actor?.trim() || "reviewer";
    const field = finding.field;
    const canApply = (REVISABLE as readonly string[]).includes(field);

    const tx = this.db.transaction(() => {
      let before: string | null = null;
      let after: string | null = null;
      if (canApply) before = this.currentValue(listing, field as Revisable);

      const revised = { ...listing.revised };
      if (decision === "approved") {
        if (finding.suggestion === null)
          throw new StoreError("This finding has no suggested revision to approve; edit or reject it.");
        revised[field as Revisable] = finding.suggestion;
        after = finding.suggestion;
      } else if (decision === "edited") {
        const v = opts.editedValue;
        if (v === undefined || v.trim() === "")
          throw new StoreError("Edited value is required");
        if (!canApply) throw new StoreError(`Field "${field}" cannot be edited here`);
        revised[field as Revisable] = v;
        after = v;
      } else if (decision === "reverted") {
        delete revised[field as Revisable];
        after = canApply ? (field === "tags" ? listing.tags.join(", ") : (listing[field as Revisable] as string)) : null;
      } else {
        after = null; // rejected: keep the current value
      }

      if (canApply && (decision === "approved" || decision === "edited" || decision === "reverted")) {
        this.db
          .prepare("UPDATE listings SET revised = ? WHERE id = ?")
          .run(JSON.stringify(revised), listing.id);
      }
      this.addHistory({
        listingId: listing.id,
        reviewId,
        findingId,
        event: decision,
        field,
        before,
        after,
        actor,
      });
    });
    tx();
    return { listing: this.getListing(listing.id)!, decisions: this.decisions(reviewId) };
  }

  finalize(listingId: number, actor = "reviewer"): StoredListing {
    const l = this.getListing(listingId);
    if (!l) throw new StoreError("Listing not found", 404);
    const review = this.latestReview(listingId);
    if (review) {
      const d = this.decisions(review.id);
      const pending = review.findings.filter(
        (f) => (f.severity === "critical" || f.severity === "major") && (d[f.id]?.decision ?? "pending") === "pending",
      );
      if (pending.length)
        throw new StoreError(
          `${pending.length} critical/major finding(s) still need a decision before finalizing.`,
        );
    }
    this.db.prepare("UPDATE listings SET status = 'finalized' WHERE id = ?").run(listingId);
    this.addHistory({ listingId, event: "finalized", actor });
    return this.getListing(listingId)!;
  }
}
