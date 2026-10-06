import { fail, getStore, ok, readJson } from "@/lib/api";
import { StoreError } from "@/lib/store";
import type { Listing } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await readJson<{ listings?: Partial<Listing>[] }>(req);
    if (!Array.isArray(body.listings)) throw new StoreError("`listings` must be an array");
    const results = await getStore().runBatch(body.listings);
    return ok({ results });
  } catch (e) {
    return fail(e);
  }
}
