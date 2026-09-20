/** A safe, expected error which can be sent to an API client. */
export class AppError extends Error { constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') { super(message); this.statusCode = statusCode; this.code = code; this.isOperational = true; } }
export class ValidationError extends AppError { constructor(message) { super(message, 422, 'VALIDATION_ERROR'); } }
export class ConflictError extends AppError { constructor(message) { super(message, 409, 'CONFLICT'); } }
export class NotFoundError extends AppError { constructor(message) { super(message, 404, 'NOT_FOUND'); } }
export class UnauthorizedError extends AppError { constructor(message = 'Authentication required') { super(message, 401, 'UNAUTHORIZED'); } }
