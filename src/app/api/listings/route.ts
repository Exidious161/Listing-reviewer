import { fail, getStore, ok, readJson } from "@/lib/api";
import type { Listing } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ listings: await (await getStore()).listSummaries() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<Listing>>(req);
    // Incomplete listings are allowed in: deterministic validation reports what is missing.
    const listing = await (await getStore()).createListing(body);
    return ok({ listing }, 201);
  } catch (e) {
    return fail(e);
  }
}
