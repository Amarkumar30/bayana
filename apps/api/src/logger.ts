import { randomUUID } from "node:crypto";
import { pino, type DestinationStream, type Logger } from "pino";

const sensitive = /authorization|cookie|password|secret|token|otp|pepper|signature|^code$/i;
export const requestId = () => randomUUID();
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sensitive.test(key) ? "[REDACTED]" : redact(entry)]));
  return value;
}
export function createLogger(destination?: DestinationStream, level = process.env.NODE_ENV === "test" ? "silent" : "info"): Logger {
  const options = { level, base: undefined, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (label: string) => ({ level: label }) } };
  return destination ? pino(options, destination) : pino(options);
}
let logger = createLogger();
/** Test hook: route log output to a capture stream. */
export function setLogger(next: Logger) { logger = next; }
export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) { logger[level]({ event, ...(redact(fields) as Record<string, unknown>) }); }
