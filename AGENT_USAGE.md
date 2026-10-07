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

## Session 2, continued — deployed to Vercel and verified live

The user chose Vercel over the Render/Railway alternatives discussed earlier (their call, made
with the ephemeral-filesystem tradeoff disclosed up front). The user authorized the Vercel CLI
non-interactively (`vercel login --non-interactive` printed a device-auth URL; no further action
needed since their browser already had an active Vercel session), which let the agent complete
the rest of the setup itself: linked the existing Vercel project, added `GEMINI_API_KEY` as a
Production secret via piped stdin (so the key value never appeared in any command output or
transcript), and triggered a production deploy — all via plain `vercel` CLI commands.

**One package was deliberately not installed:** the user's suggested `npx plugins add
vercel/vercel-plugin` (sourced from Vercel's own published agent-setup doc at
`vercel.com/get-started.md`, so not a fabricated suggestion). The `plugins` npm package's registry
history shows it as a small, unrelated utility from 2014 by a different maintainer, now at a very
different version with active canary builds — ownership/purpose changed at some point, and that
alone was reason enough not to run an unverified `npx`-auto-install of it, especially since it was
explicitly optional ("guidance only") and not required for the actual deploy/env-var operations
that were the real goal.

**Also caught:** `vercel link` silently re-added `.env*` to `.gitignore`, which would have
re-excluded `.env.example` from git the same way the original `.gitignore` bug did. Caught and
fixed again before it reached a commit.

**Verified, deployed:** seeded the live URL's `/api/seed` endpoint directly (not just opened it in
a browser) and confirmed all 8 listings came back `mode: "live"` with zero warnings, with findings
that were field-specific and clearly not canned (e.g. "Clothing & Accessories category requires
size and material attributes," "Listings for firearms and ammunition are prohibited" — matching
each listing's actual content, not generic text).

## Session 2, continued — the persistence bug got worse, so it got fixed

The disclosed Vercel persistence limitation turned out to be worse than first described: it
wasn't just "resets if idle," it broke the core workflow directly. Reproduced by curl: submit a
batch, then immediately `GET` the listing the response said was just created — `404 Listing not
found`, on the very next request. The user hit this independently in the real UI first ("it says
no listing found why") before it was reproduced and confirmed via `X-Vercel-Id` instance IDs.

Given that severity, the earlier "disclose and ship" decision was revisited and reversed: the
user chose to do the real fix. Migrated storage from a local SQLite file (via `node:sqlite`) to
**Turso** (a free, hosted, SQLite-compatible database, reachable from every serverless instance)
using `@libsql/client`:

- `db.ts`: rewritten around `@libsql/client`'s `Client`, which is SQLite-compatible both locally
  (`:memory:` for tests, `file:...` for local/container disk) and remotely (`libsql://...` for
  Turso) — one code path for all three, verified in that order before deploying.
- `store.ts`: every method converted from synchronous to `async`/`await` (libsql's remote calls
  are network calls, not local function calls). `decide()`'s transaction was rewritten against
  libsql's real interactive-transaction API (`client.transaction("write")`) rather than raw
  `BEGIN`/`COMMIT` statements, since those aren't meaningful over a remote connection the same way.
- All 6 API route handlers: updated to `await` the now-async `Store` methods. Caught one bug this
  surfaced: `src/app/api/listings/[id]/route.ts` did `const listing = store.getListing(id); if
  (!listing) throw ...` — without `await`, `listing` was always a truthy Promise object, so the
  404 branch could never fire. Would have been a second, subtler bug in the exact code path this
  whole migration was fixing, caught by reading the diff rather than just trusting the pattern
  held everywhere.
- `tests/store.test.ts`: every call site updated to `await`; `rawDb.prepare(...)` (a method on the
  old sync client) replaced with the new `prepare(rawDb, sql)` free function, since the real
  libsql `Client` has no `.prepare()` of its own.

**Verified at each stage, not just at the end:**
1. Turso connection sanity-checked standalone (raw insert/select) before touching any app code.
2. Local in-memory mode (`:memory:`) and the append-only trigger's error message both confirmed
   working identically through libsql before rewriting tests against it.
3. Full test suite: 53/53 passing against the new async store.
4. Local dev server against the *real* Turso database (not just `:memory:`): seed, then
   immediately fetch a freshly-created listing by id — confirmed persisted.
5. Deployed to Vercel with `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` set. Re-ran the exact
   reproduction from the original bug report against the live URL: batch-create, immediate fetch
   by id — now 200, not 404. Also fetched `/api/listings` three times in a row and confirmed three
   different `X-Vercel-Id` instances all returned the identical, correct, growing listing count —
   direct proof the fix holds across the exact failure mode that was reproduced earlier.

**One real slip along the way:** the user pasted the Turso database URL and auth token into the
two `.env.local` lines in the wrong order (swapped). Caught immediately because the connection
test was run before writing any migration code, not after — the error (`URL_INVALID`, given what
was obviously a JWT instead of a `libsql://` URL) made the swap obvious. Worth noting as a reason
to verify credentials in isolation before building on top of them, which is what happened.

## Known unverified items (as of this session)

- UI changes: compiled and type-checked, not eyeballed in a browser by the agent (the user has
  seen it rendered via screenshots and confirmed it looks right).
- Docker build: never run (no Docker daemon in this environment); `npm ci` and `npm run build`
  were verified outside Docker. Not blocking, since the live deployment is on Vercel, not Docker.
- The Gemini free-tier rate limit is real (modest requests/day) — fine for a demo, but if the
  deployed instance gets hit with unexpectedly heavy traffic during review, it could fall back
  to mock mid-review. Worth monitoring, not a reason not to ship this way.
- This file's own filename was wrong for most of the session: the assignment asks for
  `AGENT_USAGE.md`, and this was created and maintained as `AGENTS.md` instead (misread from the
  rubric screenshot the first time it was shown). Caught when the user re-shared the same rubric
  image and asked to double check it was covered. Renamed via `git mv` to preserve history; the
  content was correct the whole time, only the filename was wrong.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
