import { fail, getStore, ok } from "@/lib/api";
import { SAMPLE_LISTINGS } from "@/lib/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Loads the demo batch (creates + reviews each listing). */
export async function POST() {
  try {
    const results = await (await getStore()).runBatch(SAMPLE_LISTINGS);
    return ok({ results }, 201);
  } catch (e) {
    return fail(e);
  }
}

export async function GET() {
  return ok({ sample: SAMPLE_LISTINGS });
}
