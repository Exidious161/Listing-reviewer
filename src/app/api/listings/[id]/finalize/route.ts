import { fail, getStore, ok, parseId, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await ctx.params).id);
    const body = await readJson<{ actor?: string }>(req).catch(() => ({}) as { actor?: string });
    const store = getStore();
    const listing = store.finalize(id, body.actor?.trim() || "reviewer");
    return ok({ listing, history: store.history(id) });
  } catch (e) {
    return fail(e);
  }
}
