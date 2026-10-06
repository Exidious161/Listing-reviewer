type Level = "debug" | "info" | "warn" | "error";

/** Structured JSON logger. One line per event so logs are greppable and parseable. */
export function log(
  level: Level,
  event: string,
  data: Record<string, unknown> = {},
): void {
  if (process.env.NODE_ENV === "test" && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  });
  (level === "error" ? console.error : console.log)(line);
}
