import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { log } from "./logger.js";

export type ErrorBody = { error: { code: string; message: string; details: Record<string, unknown> } };
export class AppError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); this.name = "AppError"; }
}
export const errorBody = (code: string, message: string, details: Record<string, unknown> = {}): ErrorBody => ({ error: { code, message, details } });

// Existing handlers throw `Object.assign(new Error(message), { status, code })`; those are read the same way as AppError.
type HttpLike = { status?: unknown; statusCode?: unknown; code?: unknown; type?: unknown; message?: unknown; details?: unknown };
const bodyParserCodes: Record<string, string> = { "entity.parse.failed": "INVALID_JSON", "entity.too.large": "PAYLOAD_TOO_LARGE" };

export function toErrorResponse(errorValue: unknown): { status: number; body: ErrorBody } {
  if (errorValue instanceof z.ZodError) return { status: 400, body: errorBody("VALIDATION_ERROR", "Request failed validation", errorValue.flatten()) };
  const error = (typeof errorValue === "object" && errorValue !== null ? errorValue : {}) as HttpLike;
  const raw = typeof error.status === "number" ? error.status : typeof error.statusCode === "number" ? error.statusCode : 500;
  const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500;
  if (status >= 500) return { status, body: errorBody("INTERNAL_ERROR", "Unexpected server error") };
  const code = typeof error.code === "string" ? error.code : typeof error.type === "string" && bodyParserCodes[error.type] ? bodyParserCodes[error.type] : "REQUEST_FAILED";
  const details = errorValue instanceof AppError ? errorValue.details : {};
  return { status, body: errorBody(code, typeof error.message === "string" && error.message ? error.message : "Request failed", details) };
}

export function notFoundHandler(_req: Request, res: Response) { res.status(404).json(errorBody("NOT_FOUND", "Not found")); }
export function errorHandler(errorValue: unknown, req: Request, res: Response, _next: NextFunction) {
  const { status, body } = toErrorResponse(errorValue);
  const fields = { requestId: res.locals.requestId, method: req.method, path: req.path, status, errorCode: body.error.code };
  // The stack is logged server-side only for unexpected failures; clients never receive it.
  if (status >= 500) log("error", "request.failed", { ...fields, err: errorValue instanceof Error ? { name: errorValue.name, message: errorValue.message, stack: errorValue.stack } : String(errorValue) });
  else log("warn", "request.rejected", fields);
  const retryAfter = body.error.details.retryAfterSeconds;
  if (status === 429 && typeof retryAfter === "number") res.set("Retry-After", String(retryAfter));
  res.status(status).json(body);
}
