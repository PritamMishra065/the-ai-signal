/** Stable, documented error codes. Clients branch on `code`, never on the message. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  static notFound(resource: string, identifier?: string) {
    return new AppError(
      ErrorCode.NOT_FOUND,
      identifier ? `${resource} '${identifier}' does not exist.` : `${resource} does not exist.`,
    );
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(ErrorCode.BAD_REQUEST, message, details);
  }

  static conflict(message: string, details?: unknown) {
    return new AppError(ErrorCode.CONFLICT, message, details);
  }

  static unauthorized(message = 'A valid admin API key is required for this operation.') {
    return new AppError(ErrorCode.UNAUTHORIZED, message);
  }

  static rateLimited(retryAfterSeconds: number) {
    return new AppError(ErrorCode.RATE_LIMITED, 'Too many requests. Slow down.', {
      retryAfterSeconds,
    });
  }
}
