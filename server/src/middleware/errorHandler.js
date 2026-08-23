import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import { logger } from '../lib/logger.js';
export function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) return res.status(422).json({ error: 'VALIDATION_ERROR', message: error.issues[0]?.message || 'Invalid input' });
  if (error?.code === 'P2002') return res.status(409).json({ error: 'CONFLICT', message: 'This date was just taken. Please choose another date.' });
  if (error instanceof AppError) return res.status(error.statusCode).json({ error: error.code, message: error.message });
  logger.error({ err: error }, 'Unhandled request error');
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });
}
