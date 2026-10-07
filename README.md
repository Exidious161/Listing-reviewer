# Listing Quality Reviewer

A web app that reviews marketplace listings against a written marketplace policy and brand-content guide. It combines **deterministic validation** (plain code, unit tested) with an **AI review** whose every finding must cite a real policy section, then lets a human approve, edit or reject each suggested revision, with a full audit trail.

> No API key? It still works. Without a key for either provider below, the app runs in an offline **mock mode** (a rule-based reviewer that produces the same finding shape), so the demo and the tests never depend on a network call.

## Quick start

Requires Node 22.5+ (uses the built-in `node:sqlite`, so there's no native module to compile — `npm install` has no C++ toolchain requirement).

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 53 tests
npm run typecheck
```

Open the app and click **Load sample batch**: it creates and reviews 8 listings (some clean, some deliberately bad) so every feature has something to show.

To use a real LLM for the review step:

```bash
cp .env.example .env.local   # then set GEMINI_API_KEY and/or ANTHROPIC_API_KEY
```

The app supports **either Claude or Gemini** as the live reviewer — same prompt, same schema, same citation verification, picked by whichever key is actually set (Gemini first if both are, since its free tier makes it the more likely one to be funded). Gemini is the easiest to get running with zero cost: generate a key at [Google AI Studio](https://aistudio.google.com/apikey), no credit card required.

## What it does

| Area | Implementation |
|---|---|
| Listing fields | title, description, category, price, attributes, seller, optional tags |
| Deterministic checks | required fields, price format and range, title/description length, supported categories, duplicate detection (same seller + normalised title, or near-identical description via Jaccard similarity) |
| Retrieval | 16 numbered policy and brand sections; TF-IDF keyword scoring plus explicit signal rules (phone numbers, tag count, health claims, etc.) |
| AI review | Claude returns structured JSON findings: field, severity, issue type, explanation, **policy citation**, suggested rewrite, unverifiable-claim flag, stated assumption |
| Review workflow | per-finding Approve / Edit / Reject / Undo, original-vs-revised word diff, finalize gate |
| Batch | paste up to 10 listings as JSON, or load the sample batch; one bad item never fails the batch |
| History | append-only audit log of who did what, when, with before/after values |

## Scope

**Completed, matching the brief:**
- All 7 listing fields (title, description, category, price, attributes, seller, optional tags)
- All 5 deterministic checks (required fields, price format, duplicate detection, title/description length, supported categories) — `src/lib/validators.ts`, unit tested
- The full AI workflow: retrieval, severity classification, cited explanation, suggested rewrite, unverifiable-claim/assumption flags — `src/lib/reviewer.ts`, `src/lib/retrieval.ts`
- All 5 user actions: field-by-field review, approve/edit/reject (+ undo), original-vs-revised diff, batch of up to 10, append-only review/approval history

**Explicitly out of scope** (per the brief): publishing to a real marketplace, image moderation, payments, seller verification, unrestricted product categories (8 fixed categories only).

## Design decisions worth knowing

**1. Citations are verified, not trusted.** A finding is kept only if it cites a section that exists *and* was retrieved for that listing (`verifyCitations` in `src/lib/findings.ts`). Invented or irrelevant citations are discarded and counted in the UI. While testing I found this guard also exposed a retrieval recall gap (valid findings were being dropped because the right section hadn't been retrieved); I fixed that with signal rules and added a regression test that runs the whole sample batch and asserts nothing is dropped.

**2. Deterministic and AI checks are separate.** Format and policy-independent rules run as code first and never depend on the model. The model only handles judgement (misleading, unverifiable, unclear wording).

**3. Structured output with one retry.** Model output is parsed and validated with Zod. On malformed output the request is retried once with a stricter instruction. If it still fails, the app degrades to the rule-based reviewer and shows a visible warning instead of an error page.

**4. Prompt-injection posture.** Listing content is passed as JSON data and the system prompt tells the model to treat it as data. The model has no tools and can only produce findings, and every finding passes schema and citation checks before a person sees it. Nothing it outputs is applied without a human approving it.

**5. Append-only history, enforced by the database.** SQLite triggers reject `UPDATE` and `DELETE` on the history table, so the audit trail cannot be silently rewritten (covered by a test). Original listing fields are never modified; revisions live separately, so any change can be undone.

**6. Finalize gate.** A listing cannot be finalized while critical or major findings still have no decision.

**7. `node:sqlite`, not `better-sqlite3`.** The project originally used `better-sqlite3`, a native module that needs a C++ toolchain to compile. On a clean machine without Visual Studio Build Tools, `npm install` failed outright — a real risk for anyone grading this by running the quick start. Node 22.5+ ships a built-in `node:sqlite` with an almost identical synchronous API, so I swapped to it: one less native dependency, no post-install build step, same schema and triggers.

## Architecture

```
src/lib/validators.ts     deterministic checks
src/lib/policy.ts         policy + brand guide sections (original text)
src/lib/retrieval.ts      TF-IDF scoring + signal rules
src/lib/reviewer.ts       prompt, Claude call, parse/retry, fallback
src/lib/findings.ts       Zod schema, JSON extraction, citation verification
src/lib/mockReviewer.ts   offline rule-based reviewer
src/lib/store.ts          workflow logic (review, decide, finalize, batch)
src/lib/db.ts             SQLite schema, append-only triggers
src/app/api/*             route handlers
src/app/page.tsx          review UI
tests/                    Vitest suites (validators, retrieval, reviewer, store)
```

Logs are one JSON object per line (`review.complete`, `review.parse_failed`, `review.citations_dropped`, `review.live_failed`, `api.unhandled`) so they are easy to grep and ship.

## API

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/listings` | list / create |
| GET | `/api/listings/:id` | listing, latest review, decisions, history |
| POST | `/api/listings/:id/review` | run a review |
| POST | `/api/listings/:id/finalize` | finalize (blocked if undecided critical/major findings) |
| POST | `/api/reviews/:id/decisions` | `approved`, `edited`, `rejected`, `reverted` |
| POST | `/api/batch` | review up to 10 listings |
| POST | `/api/seed` | load the sample batch |

## Deployment

**Live:** [listing-reviewer.vercel.app](https://listing-reviewer.vercel.app) — `GEMINI_API_KEY` is set as a Production secret; reviews there genuinely run live (verified: seeding the sample batch returns `mode: "live"` for all 8 listings with real, field-specific findings, not mock output).

No login exists — click **Load sample batch** to see every feature immediately, or use **Add / import** to try your own listing(s).

**Known tradeoff of this host:** Vercel's filesystem is ephemeral, so the SQLite file resets on cold starts/redeploys (it lives in `/tmp` there, see `src/lib/db.ts`). If a reviewer finds it empty, **Load sample batch** repopulates it in one click — it is not a bug, just a deliberate tradeoff for a zero-cost deployment, disclosed here rather than hidden.

SQLite needs a persistent disk to survive restarts properly, so a container host is the more correct fit long-term:

- **Render / Railway / Fly.io:** use the included `Dockerfile` (`render.yaml` is provided for Render). Mount a volume at `/data`; the app writes `DATABASE_PATH=/data/app.db`. Set `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` as a secret.

The Dockerfile has not been built yet (the authoring environment had the Docker CLI but no running daemon). `npm ci` and `npm run build` were verified, so check the first deploy's build log.

## Responsible AI-tool use

This project was built with Claude Code as a coding assistant, across two sessions. See **[AGENTS.md](AGENTS.md)** for the full account: tools used, representative prompts, what was delegated, mistakes it made and how they were caught, and what has and hasn't been independently verified yet (including one open item — the live Claude API path was fixed but not yet exercised against a real key in this environment).

## Known limitations

- Duplicate detection is lexical, so paraphrased duplicates are not caught.
- Retrieval is keyword-based; with a much larger policy corpus I would move to embeddings.
- No authentication: the reviewer name is a free-text label, not an identity.
- The offline reviewer is a rule-based approximation; its rewrites are simpler than the live model's.
