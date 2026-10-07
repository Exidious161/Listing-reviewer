import { fail, getStore, ok, parseId } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await ctx.params).id);
    const store = await getStore();
    const review = await store.runReview(id);
    return ok({ review, decisions: await store.decisions(review.id), history: await store.history(id) });
  } catch (e) {
    return fail(e);
  }
}
