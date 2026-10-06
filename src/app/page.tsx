"use client";

import { diffWords } from "diff";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Finding, FindingDecision, PolicySection } from "@/lib/types";
import type { HistoryEntry, StoredListing, StoredReview } from "@/lib/store";

type Decisions = Record<string, { decision: FindingDecision; value: string | null }>;

interface Detail {
  listing: StoredListing;
  review: StoredReview | null;
  decisions: Decisions;
  history: HistoryEntry[];
}

const FIELDS = ["title", "description", "category", "price", "seller", "tags"] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

function Diff({ a, b }: { a: string; b: string }) {
  const parts = useMemo(() => diffWords(a, b), [a, b]);
  return (
    <>
      {parts.map((p, i) =>
        p.added ? <ins key={i} className="d">{p.value}</ins> : p.removed ? <del key={i} className="d">{p.value}</del> : <span key={i}>{p.value}</span>,
      )}
    </>
  );
}

function fieldValue(l: StoredListing, f: (typeof FIELDS)[number], revised: boolean): string {
  if (revised && l.revised[f] !== undefined) return l.revised[f]!;
  return f === "tags" ? l.tags.join(", ") : (l[f] as string);
}

function statusLabel(s: string) {
  return s === "in_review" ? "in review" : s;
}

export default function Home() {
  const [listings, setListings] = useState<StoredListing[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [policy, setPolicy] = useState<Record<string, PolicySection>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [actor, setActor] = useState("reviewer");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [openCite, setOpenCite] = useState<Record<string, boolean>>({});

  const refreshList = useCallback(async () => {
    const { listings } = await api<{ listings: StoredListing[] }>("/api/listings");
    setListings(listings);
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    const d = await api<Detail>(`/api/listings/${id}`);
    setDetail(d);
  }, []);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [p, l] = await Promise.all([
          api<{ sections: PolicySection[]; categories: string[] }>("/api/policy"),
          api<{ listings: StoredListing[] }>("/api/listings"),
        ]);
        setPolicy(Object.fromEntries(p.sections.map((s) => [s.id, s])));
        setCategories(p.categories);
        setListings(l.listings);
        const saved = localStorage.getItem("actor");
        if (saved) setActor(saved);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const select = (id: number) => {
    setSelected(id);
    setEditing({});
    run("Loading", () => loadDetail(id));
  };

  const loadSample = () =>
    run("Reviewing sample batch", async () => {
      const r = await api<{ results: { listing: StoredListing }[] }>("/api/seed", { method: "POST" });
      await refreshList();
      if (r.results[0]) {
        setSelected(r.results[0].listing.id);
        await loadDetail(r.results[0].listing.id);
      }
    });

  const rerun = () =>
    selected &&
    run("Running review", async () => {
      await api(`/api/listings/${selected}/review`, { method: "POST" });
      await Promise.all([loadDetail(selected), refreshList()]);
    });

  const decide = (f: Finding, decision: "approved" | "edited" | "rejected" | "reverted", editedValue?: string) =>
    detail?.review &&
    run("Saving decision", async () => {
      await api(`/api/reviews/${detail.review!.id}/decisions`, {
        method: "POST",
        body: JSON.stringify({ findingId: f.id, decision, editedValue, actor }),
      });
      setEditing((e) => {
        const n = { ...e };
        delete n[f.id];
        return n;
      });
      await Promise.all([loadDetail(detail.listing.id), refreshList()]);
    });

  const finalize = () =>
    selected &&
    run("Finalizing", async () => {
      await api(`/api/listings/${selected}/finalize`, { method: "POST", body: JSON.stringify({ actor }) });
      await Promise.all([loadDetail(selected), refreshList()]);
    });

  const grouped = useMemo(() => {
    const g: Record<string, Finding[]> = {};
    for (const f of detail?.review?.findings ?? []) (g[f.field] ??= []).push(f);
    return g;
  }, [detail]);

  const hasRevisions = detail ? Object.keys(detail.listing.revised).length > 0 : false;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Listing Quality Reviewer</h1>
        {busy && <span className="chip status">{busy}…</span>}
        <span className="spacer" />
        <label style={{ margin: 0 }} htmlFor="actor">Reviewer</label>
        <input
          id="actor"
          className="input"
          style={{ width: 140 }}
          value={actor}
          onChange={(e) => {
            setActor(e.target.value);
            localStorage.setItem("actor", e.target.value);
          }}
        />
        <button className="btn" onClick={() => setShowAdd(true)}>Add / import</button>
        <button className="btn primary" onClick={loadSample} disabled={!!busy}>Load sample batch</button>
      </header>

      <aside className="sidebar" aria-label="Listings">
        {listings.length === 0 && (
          <div className="empty">No listings yet. Load the sample batch or add one.</div>
        )}
        {listings.map((l) => (
          <button key={l.id} className={`listing-row ${selected === l.id ? "active" : ""}`} onClick={() => select(l.id)}>
            <span className="t">{(l.revised.title ?? l.title) || "(untitled)"}</span>
            <span className="m">
              <span>#{l.id}</span>
              <span>{l.seller || "no seller"}</span>
              <span className={`chip status ${l.status === "finalized" ? "finalized" : ""}`}>{statusLabel(l.status)}</span>
            </span>
          </button>
        ))}
      </aside>

      <main className="main">
        {error && <div className="error" role="alert">{error}</div>}
        {!detail && <div className="empty">Select a listing to review it.</div>}

        {detail && (
          <>
            <div className="card">
              <div className="row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  #{detail.listing.id} · {detail.listing.revised.title ?? detail.listing.title}
                </h2>
                <span className={`chip status ${detail.listing.status === "finalized" ? "finalized" : ""}`}>
                  {statusLabel(detail.listing.status)}
                </span>
                {detail.review && (
                  <span className="chip mode" title="live = Claude API, mock = rule-based offline reviewer">
                    {detail.review.mode} review
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn" onClick={rerun} disabled={!!busy}>Re-run review</button>
                <button className="btn good" onClick={finalize} disabled={!!busy || detail.listing.status === "finalized"}>
                  Finalize
                </button>
              </div>
              <p className="note" style={{ marginBottom: 0 }}>
                {detail.listing.seller} · {detail.listing.category || "no category"} · price {detail.listing.price || "—"}
              </p>
            </div>

            {detail.review?.warnings.map((w, i) => (
              <div key={i} className="warn">{w}</div>
            ))}

            <div className="card">
              <h2>Original vs revised</h2>
              {!hasRevisions && <p className="note">No revisions approved yet. Approve or edit a finding below to build the revised version.</p>}
              {FIELDS.map((f) => {
                const a = fieldValue(detail.listing, f, false);
                const b = fieldValue(detail.listing, f, true);
                const changed = a !== b;
                return (
                  <div key={f}>
                    <div className="fieldname">{f}{changed && " · changed"}</div>
                    <div className="cmp">
                      <div className="col"><h4>Original</h4>{changed ? <Diff a={a} b="" /> : a || <span className="note">(empty)</span>}</div>
                      <div className="col"><h4>Revised</h4>{changed ? <Diff a={a} b={b} /> : <span className="note">unchanged</span>}</div>
                    </div>
                  </div>
                );
              })}
              {Object.keys(detail.listing.attributes).length > 0 && (
                <>
                  <div className="fieldname">attributes</div>
                  <div className="col" style={{ padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
                    {Object.entries(detail.listing.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <h2>Deterministic checks</h2>
              {detail.review && detail.review.validationIssues.length === 0 && (
                <p className="note">All rule checks passed (required fields, price, length, category, duplicates).</p>
              )}
              {detail.review?.validationIssues.map((v, i) => (
                <div key={i} className="finding">
                  <div className="row">
                    <span className={`chip ${v.severity}`}>{v.severity}</span>
                    <strong>{v.field}</strong>
                    <span className="note">{v.rule}</span>
                  </div>
                  <p style={{ marginBottom: 0 }}>{v.message}</p>
                </div>
              ))}
            </div>

            <div className="card">
              <h2>AI findings, field by field</h2>
              {detail.review && detail.review.findings.length === 0 && (
                <p className="note">No policy findings for this listing.</p>
              )}
              {Object.entries(grouped).map(([field, fs]) => (
                <div key={field}>
                  <div className="fieldname">{field}</div>
                  {fs.map((f) => {
                    const d = detail.decisions[f.id] ?? { decision: "pending" as const, value: null };
                    const sec = policy[f.policyCitation];
                    const key = `${f.id}`;
                    const current =
                      (FIELDS as readonly string[]).includes(f.field)
                        ? fieldValue(detail.listing, f.field as (typeof FIELDS)[number], true)
                        : "";
                    const canEditField = (FIELDS as readonly string[]).includes(f.field);
                    return (
                      <div key={f.id} className={`finding ${d.decision !== "pending" ? "done" : ""}`}>
                        <div className="row">
                          <span className={`chip ${f.severity}`}>{f.severity}</span>
                          <span className="chip status">{f.issueType}</span>
                          {f.unverifiableClaim && <span className="chip minor">unverifiable claim</span>}
                          <button className="cite" onClick={() => setOpenCite((o) => ({ ...o, [key]: !o[key] }))} aria-expanded={!!openCite[key]}>
                            {f.policyCitation}
                          </button>
                          <span style={{ flex: 1 }} />
                          {d.decision !== "pending" && <span className={`chip ${d.decision === "rejected" ? "status" : "finalized"}`}>{d.decision}</span>}
                        </div>
                        <p>{f.explanation}</p>
                        {openCite[key] && sec && (
                          <div className="policybox">
                            <strong>{sec.id} · {sec.title}</strong>
                            <div>{sec.text}</div>
                          </div>
                        )}
                        {f.assumption && <p className="note">Assumption: {f.assumption}</p>}
                        {f.suggestion !== null && (
                          <div className="suggest">
                            <div className="note" style={{ marginBottom: 4 }}>Suggested wording</div>
                            {canEditField ? <Diff a={current} b={f.suggestion} /> : f.suggestion}
                          </div>
                        )}
                        {f.suggestion === null && <p className="note">No automatic rewrite — the seller must supply this information.</p>}

                        {editing[f.id] !== undefined && (
                          <div style={{ marginTop: 8 }}>
                            <label htmlFor={`e-${f.id}`}>Your revision for {f.field}</label>
                            <textarea id={`e-${f.id}`} value={editing[f.id]} onChange={(e) => setEditing((x) => ({ ...x, [f.id]: e.target.value }))} />
                            <div className="actions">
                              <button className="btn good small" disabled={!!busy || !editing[f.id].trim()} onClick={() => decide(f, "edited", editing[f.id])}>Save edit</button>
                              <button className="btn small" onClick={() => setEditing((x) => { const n = { ...x }; delete n[f.id]; return n; })}>Cancel</button>
                            </div>
                          </div>
                        )}

                        {editing[f.id] === undefined && (
                          <div className="actions">
                            <button className="btn good small" disabled={!!busy || f.suggestion === null} onClick={() => decide(f, "approved")}>Approve</button>
                            <button className="btn small" disabled={!!busy || !canEditField} onClick={() => setEditing((x) => ({ ...x, [f.id]: d.value ?? f.suggestion ?? current }))}>Edit</button>
                            <button className="btn bad small" disabled={!!busy} onClick={() => decide(f, "rejected")}>Reject</button>
                            {d.decision !== "pending" && <button className="btn small" disabled={!!busy} onClick={() => decide(f, "reverted")}>Undo</button>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {detail.review && detail.review.dropped.length > 0 && (
                <p className="note" style={{ marginTop: 12 }}>
                  {detail.review.dropped.length} AI finding(s) were discarded because they cited a policy section that does not exist or was not retrieved.
                </p>
              )}
              {detail.review && (
                <p className="note">Policy sections retrieved for this review: {detail.review.retrievedSections.join(", ")}</p>
              )}
            </div>

            <div className="card">
              <h2>History</h2>
              <ul className="tl">
                {detail.history.map((h) => (
                  <li key={h.id}>
                    <span className="note">{new Date(h.createdAt).toLocaleString()}</span>
                    <span className="ev">{h.event}</span>
                    <span>
                      <strong>{h.actor}</strong>
                      {h.field ? ` · ${h.field}` : ""}
                      {h.before !== null || h.after !== null ? (
                        <span className="note"> {h.before !== null ? `“${h.before}”` : ""}{h.before !== null && h.after !== null ? " → " : ""}{h.after !== null ? `“${h.after}”` : ""}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </main>

      {showAdd && (
        <AddModal
          categories={categories}
          onClose={() => setShowAdd(false)}
          onDone={async (id) => {
            setShowAdd(false);
            await refreshList();
            if (id) select(id);
          }}
          run={run}
        />
      )}
    </div>
  );
}

function AddModal({
  categories,
  onClose,
  onDone,
  run,
}: {
  categories: string[];
  onClose: () => void;
  onDone: (id?: number) => Promise<void>;
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const [tab, setTab] = useState<"single" | "batch">("single");
  const [f, setF] = useState({ title: "", description: "", category: "", price: "", seller: "", tags: "", attributes: "" });
  const [json, setJson] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const parseAttrs = (s: string) =>
    Object.fromEntries(
      s.split("\n").map((l) => l.split(":")).filter((p) => p.length >= 2 && p[0].trim()).map((p) => [p[0].trim(), p.slice(1).join(":").trim()]),
    );

  const submitSingle = () =>
    run("Reviewing listing", async () => {
      const { listing } = await api<{ listing: StoredListing }>("/api/listings", {
        method: "POST",
        body: JSON.stringify({
          ...f,
          tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
          attributes: parseAttrs(f.attributes),
        }),
      });
      await api(`/api/listings/${listing.id}/review`, { method: "POST" });
      await onDone(listing.id);
    });

  const submitBatch = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setErr("That is not valid JSON.");
      return;
    }
    const arr = Array.isArray(parsed) ? parsed : (parsed as { listings?: unknown })?.listings;
    if (!Array.isArray(arr)) {
      setErr("Provide a JSON array of listings.");
      return;
    }
    setErr(null);
    run("Reviewing batch", async () => {
      const r = await api<{ results: { listing: StoredListing }[] }>("/api/batch", { method: "POST", body: JSON.stringify({ listings: arr }) });
      await onDone(r.results[0]?.listing.id);
    });
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add listing">
        <div className="tabs">
          <button className={tab === "single" ? "on" : ""} onClick={() => setTab("single")}>Single listing</button>
          <button className={tab === "batch" ? "on" : ""} onClick={() => setTab("batch")}>Batch (JSON, max 10)</button>
        </div>
        {tab === "single" ? (
          <>
            <label htmlFor="a-title">Title</label>
            <input id="a-title" className="input" value={f.title} onChange={set("title")} />
            <label htmlFor="a-desc">Description</label>
            <textarea id="a-desc" value={f.description} onChange={set("description")} />
            <div className="grid2">
              <div>
                <label htmlFor="a-cat">Category</label>
                <select id="a-cat" value={f.category} onChange={set("category")}>
                  <option value="">Select…</option>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="a-price">Price</label>
                <input id="a-price" className="input" value={f.price} onChange={set("price")} placeholder="24.99" />
              </div>
              <div>
                <label htmlFor="a-seller">Seller</label>
                <input id="a-seller" className="input" value={f.seller} onChange={set("seller")} />
              </div>
              <div>
                <label htmlFor="a-tags">Tags (comma separated, optional)</label>
                <input id="a-tags" className="input" value={f.tags} onChange={set("tags")} />
              </div>
            </div>
            <label htmlFor="a-attrs">Attributes (one “key: value” per line)</label>
            <textarea id="a-attrs" value={f.attributes} onChange={set("attributes")} placeholder={"material: stainless steel\ncapacity: 750ml"} />
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={submitSingle}>Create &amp; review</button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="a-json">Listings JSON array — fields: title, description, category, price, attributes, seller, tags</label>
            <textarea id="a-json" style={{ minHeight: 220 }} value={json} onChange={(e) => setJson(e.target.value)} placeholder='[{"title":"…","description":"…","category":"Electronics","price":"99","attributes":{"model":"X1"},"seller":"Acme","tags":[]}]' />
            {err && <div className="error">{err}</div>}
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={submitBatch}>Review batch</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
