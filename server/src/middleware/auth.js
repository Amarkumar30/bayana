import jwt from 'jsonwebtoken';
import { config } from '../lib/config.js';
import { UnauthorizedError } from '../errors.js';
export function authenticate(req, _res, next) { try { const value = req.headers.authorization; if (!value?.startsWith('Bearer ')) throw new UnauthorizedError(); req.auth = jwt.verify(value.slice(7), config.JWT_ACCESS_SECRET); next(); } catch { next(new UnauthorizedError('Invalid or expired access token')); } }
/** Ensures a vendor can only operate on records owned by their JWT subject. */
export function ensureOwnership(idParam = 'vendorId') { return (req, _res, next) => { if (req.params[idParam] !== req.auth.sub) return next(new UnauthorizedError('You do not own this resource')); next(); }; }
