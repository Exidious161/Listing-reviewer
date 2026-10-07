import { fail, getStore, ok, parseId } from "@/lib/api";
import { StoreError } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await ctx.params).id);
    const store = await getStore();
    const listing = await store.getListing(id);
    if (!listing) throw new StoreError("Listing not found", 404);
    const review = await store.latestReview(id);
    return ok({
      listing,
      review,
      decisions: review ? await store.decisions(review.id) : {},
      history: await store.history(id),
    });
  } catch (e) {
    return fail(e);
  }
}
