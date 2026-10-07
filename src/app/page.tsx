"use client";

import { diffWords } from "diff";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Finding, FindingDecision, PolicySection } from "@/lib/types";
import type { HistoryEntry, ListingSummary, StoredListing, StoredReview } from "@/lib/store";

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

const STATUS_FILTERS = ["all", "new", "in_review", "finalized"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10h9a5 5 0 0 1 0 10h-2" />
      <path d="M7 5 3 10l4 5" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v18" />
      <path d="M5 4h12l-3 4 3 4H5" />
    </svg>
  );
}

export default function Home() {
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    setShowGuide(localStorage.getItem("guideDismissed") !== "1");
  }, []);
  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem("guideDismissed", "1");
  };
  const reopenGuide = () => {
    setShowGuide(true);
    localStorage.removeItem("guideDismissed");
  };

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("flash");
    void el.offsetWidth; // restart the animation if it's already mid-flash
    el.classList.add("flash");
    window.setTimeout(() => el.classList.remove("flash"), 1500);
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  useEffect(() => {
    if (theme) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("theme", theme);
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, [theme]);
  const toggleTheme = () => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = theme ?? (prefersDark ? "dark" : "light");
    setTheme(current === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const refreshList = useCallback(async () => {
    const { listings } = await api<{ listings: ListingSummary[] }>("/api/listings");
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
          api<{ listings: ListingSummary[] }>("/api/listings"),
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

  const filteredListings = useMemo(
    () => (statusFilter === "all" ? listings : listings.filter((l) => l.status === statusFilter)),
    [listings, statusFilter],
  );

  const progress = useMemo(() => {
    const findings = detail?.review?.findings ?? [];
    if (findings.length === 0) return null;
    let resolved = 0;
    let blocking = 0;
    for (const f of findings) {
      const pending = (detail!.decisions[f.id]?.decision ?? "pending") === "pending";
      if (!pending) resolved++;
      else if (f.severity === "critical" || f.severity === "major") blocking++;
    }
    return { total: findings.length, resolved, blocking };
  }, [detail]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">LQ</span>
          <h1>Listing Quality Reviewer</h1>
        </div>
        {busy && (
          <span className="chip status">
            <span className="spinner" aria-hidden="true" />
            {busy}…
          </span>
        )}
        <span className="spacer" />
        <div className="reviewer-field">
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
        </div>
        {!showGuide && (
          <button className="btn guide-reopen small" onClick={reopenGuide}>What am I looking at?</button>
        )}
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle color theme" title="Toggle color theme">
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button id="topbar-add" className="btn" onClick={() => setShowAdd(true)}>Add / import</button>
        <button id="topbar-sample" className="btn primary" onClick={loadSample} disabled={!!busy}>Load sample batch</button>
      </header>

      <aside className="sidebar" aria-label="Listings">
        <div className="sidebar-top">
          <div className="sidebar-head">Listings{listings.length > 0 ? ` · ${listings.length}` : ""}</div>
          <div className="sidebar-filters" role="tablist" aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => (
              <button key={s} className={statusFilter === s ? "on" : ""} onClick={() => setStatusFilter(s)} role="tab" aria-selected={statusFilter === s}>
                {s === "all" ? "all" : statusLabel(s)}
              </button>
            ))}
          </div>
        </div>
        {filteredListings.length === 0 && (
          <div className="empty">
            {listings.length === 0 ? <>No listings yet.<br />Load the sample batch or add one.</> : "No listings match this filter."}
          </div>
        )}
        {filteredListings.map((l) => (
          <button key={l.id} className={`listing-row ${selected === l.id ? "active" : ""}`} onClick={() => select(l.id)}>
            <span className="t">{(l.revised.title ?? l.title) || "(untitled)"}</span>
            <span className="m">
              <span>#{l.id}</span>
              <span>{l.seller || "no seller"}</span>
              <span className={`chip status ${l.status === "finalized" ? "finalized" : ""}`}>{statusLabel(l.status)}</span>
            </span>
            {l.summary.total > 0 && (
              <span className="badge-row">
                {l.summary.blocking > 0 && <span className="badge blocking">{l.summary.blocking} blocking</span>}
                <span className={`badge ${l.summary.resolved > 0 ? "resolved" : ""} ${l.summary.resolved === l.summary.total ? "done" : ""}`}>
                  {l.summary.resolved}/{l.summary.total} resolved
                </span>
              </span>
            )}
          </button>
        ))}
      </aside>

      <main className="main">
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
          </div>
        )}
        {showGuide && (
          <div className="guide">
            <button className="guide-close" aria-label="Dismiss guide" onClick={dismissGuide}>×</button>
            <h2>How to read this app</h2>
            <p className="card-sub" style={{ margin: "-4px 0 10px" }}>
              Click any line to jump to that part of the page.{!detail && " Select a listing (or Load sample batch) first — most of these live in the listing detail."}
            </p>
            <ol>
              <li>
                <button className="guide-item" disabled={!detail} onClick={() => jumpTo("card-deterministic")}>
                  <strong>Deterministic checks</strong> — plain code, no AI: required fields, price format, duplicates, title/description length, supported categories.
                </button>
              </li>
              <li>
                <button className="guide-item" disabled={!detail} onClick={() => jumpTo("card-ai-findings")}>
                  <strong>AI findings, field by field</strong> — LLM-reviewed, grounded in policy: every finding cites a real section (fabricated citations are discarded automatically), flags severity, unverifiable claims, and suggests a rewrite.
                </button>
              </li>
              <li>
                <button className="guide-item" disabled={!detail} onClick={() => jumpTo("card-original-revised")}>
                  <strong>Approve / Edit / Reject / Undo</strong> on each finding, and <strong>Original vs revised</strong> — the required human-in-the-loop review actions.
                </button>
              </li>
              <li>
                <button className="guide-item" disabled={!detail} onClick={() => jumpTo("card-history")}>
                  <strong>History</strong> — the append-only audit trail of every decision.
                </button>
              </li>
              <li>
                <button className="guide-item" onClick={() => { jumpTo("topbar-add"); jumpTo("topbar-sample"); }}>
                  <strong>Add / import</strong> (top right) — single listing or a batch of up to 10 as JSON; <strong>Load sample batch</strong> seeds 8 listings in one click.
                </button>
              </li>
            </ol>
          </div>
        )}
        {!detail && <div className="empty">Select a listing to review it.</div>}

        {detail && (
          <div key={detail.listing.id} className="fade-in">
            <div className="card">
              <div className="row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  #{detail.listing.id} · {detail.listing.revised.title ?? detail.listing.title}
                </h2>
                <span className={`chip status ${detail.listing.status === "finalized" ? "finalized" : ""}`}>
                  {statusLabel(detail.listing.status)}
                </span>
                {detail.review && (
                  <span className="chip mode" title="live = Claude or Gemini API, mock = rule-based offline reviewer">
                    {detail.review.mode} review
                  </span>
                )}
                {progress && (
                  <span className="progress-chip" title={`${progress.resolved} of ${progress.total} findings have a decision`}>
                    <span className={`progress-bar ${progress.blocking > 0 ? "blocking" : ""}`}>
                      <span style={{ width: `${(progress.resolved / progress.total) * 100}%` }} />
                    </span>
                    {progress.resolved}/{progress.total} resolved
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn" onClick={rerun} disabled={!!busy}><RefreshIcon />Re-run review</button>
                <button
                  className="btn good"
                  onClick={finalize}
                  disabled={!!busy || detail.listing.status === "finalized"}
                  title={progress && progress.blocking > 0 ? `${progress.blocking} critical/major finding(s) still need a decision` : undefined}
                >
                  <FlagIcon />Finalize
                </button>
              </div>
              <p className="note" style={{ marginBottom: 0 }}>
                {detail.listing.seller} · {detail.listing.category || "no category"} · price {detail.listing.price || "—"}
              </p>
              {progress && progress.blocking > 0 && detail.listing.status !== "finalized" && (
                <p className="note" style={{ marginBottom: 0, marginTop: 6, color: "var(--crit)" }}>
                  {progress.blocking} critical/major finding(s) need a decision before this can be finalized.
                </p>
              )}
            </div>

            {detail.review?.warnings.map((w, i) => (
              <div key={i} className="warn">{w}</div>
            ))}

            <div className="card" id="card-original-revised">
              <div className="card-head">
                <h2>Original vs revised</h2>
                <div className="card-sub">What the seller submitted vs. what the reviewer has approved or edited so far. The original is never overwritten.</div>
              </div>
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

            <div className="card" id="card-deterministic">
              <div className="card-head">
                <h2>Deterministic checks</h2>
                <div className="card-sub"><span className="src rule">Plain code, not AI</span> — required fields, price format, duplicate detection, title/description length, supported categories.</div>
              </div>
              {detail.review && detail.review.validationIssues.length === 0 && (
                <p className="note">All rule checks passed (required fields, price, length, category, duplicates).</p>
              )}
              {detail.review?.validationIssues.map((v, i) => (
                <div key={i} className={`finding sev-${v.severity}`}>
                  <div className="row">
                    <span className={`chip ${v.severity}`}><span className="dot" />{v.severity}</span>
                    <strong>{v.field}</strong>
                    <span className="note">{v.rule}</span>
                  </div>
                  <p style={{ marginBottom: 0 }}>{v.message}</p>
                </div>
              ))}
            </div>

            <div className="card" id="card-ai-findings">
              <div className="card-head">
                <h2>AI findings, field by field</h2>
                <div className="card-sub">
                  <span className="src ai">{detail.review?.mode === "live" ? "AI, live" : "Rule-based mock"}</span> — every finding below cites a real policy section (click the citation chip to read it); citations that don&apos;t check out are discarded before you ever see them.
                </div>
              </div>
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
                      <div key={f.id} className={`finding sev-${f.severity} ${d.decision !== "pending" ? "done" : ""}`}>
                        <div className="row">
                          <span className={`chip ${f.severity}`}><span className="dot" />{f.severity}</span>
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
                              <button className="btn good small" disabled={!!busy || !editing[f.id].trim()} onClick={() => decide(f, "edited", editing[f.id])}><CheckIcon />Save edit</button>
                              <button className="btn small" onClick={() => setEditing((x) => { const n = { ...x }; delete n[f.id]; return n; })}><XIcon />Cancel</button>
                            </div>
                          </div>
                        )}

                        {editing[f.id] === undefined && (
                          <div className="actions">
                            <button className="btn good small" disabled={!!busy || f.suggestion === null} onClick={() => decide(f, "approved")}><CheckIcon />Approve</button>
                            <button className="btn small" disabled={!!busy || !canEditField} onClick={() => setEditing((x) => ({ ...x, [f.id]: d.value ?? f.suggestion ?? current }))}><EditIcon />Edit</button>
                            <button className="btn bad small" disabled={!!busy} onClick={() => decide(f, "rejected")}><XIcon />Reject</button>
                            {d.decision !== "pending" && <button className="btn small" disabled={!!busy} onClick={() => decide(f, "reverted")}><UndoIcon />Undo</button>}
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

            <div className="card" id="card-history">
              <div className="card-head">
                <h2>History</h2>
                <div className="card-sub">Append-only audit trail — every decision is logged with who, when, and the before/after value; it cannot be edited or deleted, even at the database level.</div>
              </div>
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
          </div>
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
        <div className="modal-head">
          <h3>Add listing{tab === "batch" ? "s" : ""}</h3>
          <button className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
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
