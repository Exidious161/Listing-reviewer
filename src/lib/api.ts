import { NextResponse } from "next/server";
import { getDb } from "./db";
import { log } from "./logger";
import { Store, StoreError } from "./store";

export function getStore(): Store {
  return new Store(getDb());
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(err: unknown) {
  if (err instanceof StoreError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const msg = err instanceof Error ? err.message : String(err);
  log("error", "api.unhandled", { error: msg });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new StoreError("Request body must be valid JSON");
  }
}

export function parseId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new StoreError("Invalid id");
  return n;
}
