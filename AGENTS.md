# AI agent usage

This project was built with Claude Code (Anthropic's CLI coding agent) across two sessions in
this same checkout. This file documents what was delegated to it, what it got wrong, and how
the output was checked — per the assignment's documentation requirement.

## Tools

Claude Code, with shell (npm/git/curl), file read/write/edit, and test-runner access. No other
agents or MCP tools were used. The application itself calls the Anthropic Messages API
(`@anthropic-ai/sdk`) at review time — that is the product's own AI workflow, not a build tool.

## Session 1 — initial build (commit `bbbebf2`)

Prompt (paraphrased): build the Marketplace Listing Quality Reviewer described in the problem
statement — deterministic validation, retrieval-grounded AI review with policy citations, an
approve/edit/reject workflow, and an audit trail.

Delegated work: the whole first version — Next.js scaffold, `validators.ts`, `retrieval.ts`,
`reviewer.ts`, `findings.ts`, `mockReviewer.ts`, `store.ts`, `db.ts`, the review UI, and the
Vitest suite.

Mistake caught and fixed (documented in the README's "Design decisions" section): the
citation-verification guard in `findings.ts` was dropping valid AI findings, because retrieval
hadn't pulled in the policy section they cited — a recall gap, not a model hallucination. Caught
by running the full sample batch and checking the dropped-citation count; fixed with explicit
signal rules in `retrieval.ts` and a regression test that runs the sample batch and asserts
nothing valid gets dropped.

Verification performed: `npm test`, `npm run build`, and live HTTP calls against the running
dev server, including malformed requests and the finalize gate.

## Session 2 — resuming, UI pass, assignment check (this session)

**Prompt: "resume" / "they have made the project", pasted the problem statement.**
Found: one commit, `node_modules` not installed, never run on this machine.

**Prompt: "start this in local" (effectively — `npm install` was attempted first).**
`npm install` failed outright: `better-sqlite3` needs a native build, had no prebuilt binary for
this Node version (v24.12.0) on Windows, and the machine has no Visual Studio C++ Build Tools, so
`node-gyp`'s source build failed. This is the kind of failure any reviewer running `npm install`
cold would also hit.

Decision made without asking first, then flagged: replaced `better-sqlite3` with Node's built-in
`node:sqlite` (stable enough since Node 22.5, no native compile step, nearly identical sync API —
just no `.transaction()` helper, so a small `runInTransaction` wrapper was added). Updated
`db.ts`, `store.ts`, `package.json`, `next.config.mjs`, `Dockerfile`.

Verified by: `npm test` (53/53), `tsc --noEmit`, `next build`, and live `curl` calls against the
running server (`/api/seed`, `/api/listings`, the finalize gate) — not just the test suite, since
the whole point was confirming the DB layer works outside of tests too.

**Prompt: "improve the ui" / "more ui/ux changes it looks good".**
Visual/UX pass: `globals.css` design tokens (shadows, radius, transitions), severity-colored
finding borders, a redone history timeline, a busy-state spinner, a proper modal header, sidebar
status filters, per-listing finding-count badges (new `Store.listSummaries()` method + an added
field on `GET /api/listings`), a resolution-progress chip on the listing header, and a light/dark
theme toggle.

**Gap, disclosed rather than glossed over:** verification for this pass was `tsc --noEmit`,
`npm test`, `next build`, and `curl` against the API — not an actual look at the rendered page in
a browser. No browser tool was available to this agent for a `localhost` target (`WebFetch`
explicitly refuses localhost). These are visual changes; "it compiles and the API responds" is
not the same as "it looks right." **This needs a human visual check before relying on it.**

**Prompt: "is this good according to the assignment" (+ a screenshot of the grading rubric).**
Re-read the original problem statement and checked the code against it function by function:
`validators.ts` for the 5 required deterministic checks, `types.ts`/`reviewer.ts` for the 6-part
AI workflow, `store.ts` for the 5 user actions. All present.

While doing that, found a second real bug: `reviewer.ts` defaulted the live Claude call to model
id `claude-sonnet-5-5`, which is not a real model id (the current id is `claude-sonnet-5`). Since
`reviewListing()` catches a failed live call and silently falls back to the rule-based mock
reviewer — a deliberate resilience feature — this bug would never surface as a hard error. It
would just mean "live" mode silently never worked, hidden behind the existing fallback-warning
banner that looks the same whether the cause is "no API key" or "broken API call." Fixed the
default to `claude-sonnet-5` in both `reviewer.ts` and `.env.example`.

**At the time, not independently verified:** this environment had no `ANTHROPIC_API_KEY`, so the
fix was reviewed and reasoned through, not exercised against the real Anthropic API.

## Session 2, continued — Anthropic has no credit; added Gemini as a free alternative

The user added a real `ANTHROPIC_API_KEY` and ran a live review. The request reached the real
API correctly (confirming the model-id fix worked) but failed with "Your credit balance is too
low to access the Anthropic API" — a billing problem, not a code problem. The user doesn't have
funds to add credit.

**Decision:** rather than block on that, added Google's Gemini API as a second, free-tier
provider (confirmed via live web search against `ai.google.dev`, not assumed from training data,
since pricing/free-tier terms change — the official docs confirmed free tier is an ongoing
offering with real but modest rate limits, not a one-time trial). `reviewer.ts` already defined
the LLM call as a swappable `(system, user) => Promise<string>` function, so this was an addition
(`geminiCall()`), not a rewrite — `configuredLlmCall()` picks Gemini first if both keys are
present, since it's the one actually likely to be funded.

**Two real bugs caught getting this working, in order:**
1. `model: ""` was sent to both providers' APIs when `ANTHROPIC_MODEL=`/`GEMINI_MODEL=` were
   left blank in `.env.local`. The code used `??` (nullish coalescing), which only falls back on
   `null`/`undefined` — an explicitly-blank env var is `""`, which is neither, so the default
   never applied. Fixed by switching to `||` for both. This bug existed for Anthropic the whole
   time too; it just never surfaced because the billing error fired first.
2. The default Gemini model (`gemini-2.5-flash-lite`) is deprecated for new accounts. The API's
   own error message named the replacement (`gemini-3.5-flash-lite`) directly — updated the
   default to that.

**Verified, this time for real:** after both fixes, a live review against a deliberately bad
listing returned `mode: "live"`, zero warnings, and three findings that were genuinely
model-generated judgment calls (a disguised health-style claim, a brand-replica flag, a
category-specific missing-attribute catch with its own stated assumption) citing three different
real policy sections — not canned mock text. This is the first point in the project where "the
AI workflow works" stopped being a claim and became something actually observed.

## Known unverified items (as of this session)

- UI changes: compiled and type-checked, not eyeballed in a browser by the agent.
- Docker build: never run (no Docker daemon in this environment); `npm ci` and `npm run build`
  were verified outside Docker.
- Hosted deployment: not yet done — see README's Deployment section.
- The Gemini free-tier rate limit is real (modest requests/day) — fine for a demo, but if the
  deployed instance gets hit with unexpectedly heavy traffic during review, it could fall back
  to mock mid-review. Worth monitoring, not a reason not to ship this way.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
