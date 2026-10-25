import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { errorBody } from "./errors.js";

// CSRF defence in depth (SPEC 12.4/12.5), on top of SameSite=Lax session cookies. A state-changing request that a browser
// marks as coming from another site, or whose Origin is not one of our web origins, is refused before any handler runs.
// Server-to-server callers send no Origin: the Razorpay webhook (mounted before this, raw body) and the job runner
// (Bearer secret) are exempt by path.
const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export function originCheck(req: Request, res: Response, next: NextFunction) {
  if (!unsafe.has(req.method) || req.path.startsWith("/internal/jobs/") || req.path.startsWith("/webhooks/")) return next();
  const origin = req.header("origin"), site = req.header("sec-fetch-site");
  const badOrigin = origin !== undefined && (origin === "null" || !config.WEB_ORIGINS.includes(origin));
  if (badOrigin || site === "cross-site") return res.status(403).json(errorBody("ORIGIN_NOT_ALLOWED", "This request did not come from Bayana"));
  next();
}
