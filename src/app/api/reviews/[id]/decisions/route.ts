import { fail, getStore, ok, parseId, readJson } from "@/lib/api";
import { StoreError } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["approved", "edited", "rejected", "reverted"] as const;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const reviewId = parseId((await ctx.params).id);
    const body = await readJson<{
      findingId?: string;
      decision?: string;
      editedValue?: string;
      actor?: string;
    }>(req);
    if (!body.findingId) throw new StoreError("findingId is required");
    if (!ALLOWED.includes(body.decision as (typeof ALLOWED)[number]))
      throw new StoreError(`decision must be one of: ${ALLOWED.join(", ")}`);
    const store = getStore();
    const result = store.decide(reviewId, body.findingId, body.decision as (typeof ALLOWED)[number], {
      editedValue: body.editedValue,
      actor: body.actor,
    });
    return ok({ ...result, history: store.history(result.listing.id) });
  } catch (e) {
    return fail(e);
  }
}
