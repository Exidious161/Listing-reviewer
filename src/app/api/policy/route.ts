import { ok } from "@/lib/api";
import { POLICY_SECTIONS } from "@/lib/policy";
import { SUPPORTED_CATEGORIES } from "@/lib/types";

export const dynamic = "force-static";

export async function GET() {
  return ok({ sections: POLICY_SECTIONS, categories: SUPPORTED_CATEGORIES });
}
