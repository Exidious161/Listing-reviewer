# Listing Quality Reviewer

A web app that reviews marketplace listings against a written marketplace policy and brand-content guide. It combines **deterministic validation** (plain code, unit tested) with an **AI review** whose every finding must cite a real policy section, then lets a human approve, edit or reject each suggested revision, with a full audit trail.

> No API key? It still works. Without `ANTHROPIC_API_KEY` the app runs in an offline **mock mode** (a rule-based reviewer that produces the same finding shape), so the demo and the tests never depend on a network call.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 53 tests
npm run typecheck
```

Open the app and click **Load sample batch**: it creates and reviews 8 listings (some clean, some deliberately bad) so every feature has something to show.

To use Claude for the review step:

```bash
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
```

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

## Design decisions worth knowing

**1. Citations are verified, not trusted.** A finding is kept only if it cites a section that exists *and* was retrieved for that listing (`verifyCitations` in `src/lib/findings.ts`). Invented or irrelevant citations are discarded and counted in the UI. While testing I found this guard also exposed a retrieval recall gap (valid findings were being dropped because the right section hadn't been retrieved); I fixed that with signal rules and added a regression test that runs the whole sample batch and asserts nothing is dropped.

**2. Deterministic and AI checks are separate.** Format and policy-independent rules run as code first and never depend on the model. The model only handles judgement (misleading, unverifiable, unclear wording).

**3. Structured output with one retry.** Model output is parsed and validated with Zod. On malformed output the request is retried once with a stricter instruction. If it still fails, the app degrades to the rule-based reviewer and shows a visible warning instead of an error page.

**4. Prompt-injection posture.** Listing content is passed as JSON data and the system prompt tells the model to treat it as data. The model has no tools and can only produce findings, and every finding passes schema and citation checks before a person sees it. Nothing it outputs is applied without a human approving it.

**5. Append-only history, enforced by the database.** SQLite triggers reject `UPDATE` and `DELETE` on the history table, so the audit trail cannot be silently rewritten (covered by a test). Original listing fields are never modified; revisions live separately, so any change can be undone.

**6. Finalize gate.** A listing cannot be finalized while critical or major findings still have no decision.

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

SQLite needs a persistent disk, so a container host is the better fit.

- **Render / Railway / Fly.io:** use the included `Dockerfile` (`render.yaml` is provided). Mount a volume at `/data`; the app writes `DATABASE_PATH=/data/app.db`. Set `ANTHROPIC_API_KEY` as a secret.
- **Vercel:** works for a demo, but the filesystem is ephemeral (the DB lives in `/tmp` and resets on cold starts). Use **Load sample batch** to repopulate.

The Dockerfile has not been built yet (the authoring environment had the Docker CLI but no running daemon). `npm ci` and `npm run build` were verified, so check the first deploy's build log.

## Responsible AI-tool use

This project was built with Claude Code as a coding assistant. I used it to scaffold, implement and test, and reviewed the code and behaviour myself. Things I verified by running them rather than assuming: the unit tests, the production build, and live HTTP calls against the running server (including malformed requests and the finalize gate). One bug (retrieval recall dropping valid findings) was found that way and fixed with a regression test.

## Known limitations

- Duplicate detection is lexical, so paraphrased duplicates are not caught.
- Retrieval is keyword-based; with a much larger policy corpus I would move to embeddings.
- No authentication: the reviewer name is a free-text label, not an identity.
- The offline reviewer is a rule-based approximation; its rewrites are simpler than the live model's.
