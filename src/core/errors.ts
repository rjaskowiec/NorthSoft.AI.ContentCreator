/**
 * Core Error Handling
 *
 * Centralized error types and the global Hono error handler.
 * Errors never expose internal details or secrets to the client.
 */

import type { ErrorHandler } from 'hono';
import type { AppEnv } from '../index';

/**
 * Application-specific error base class.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = 'INTERNAL_ERROR',
    public readonly isOperational: boolean = true,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * Global error handler for Hono.
 * - Operational errors: return structured JSON with appropriate status code.
 * - Unexpected errors: log internally, return generic 500 to client.
 */
export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof AppError && err.isOperational) {
    const body: Record<string, unknown> = {
      error: err.code,
      message: err.message,
    };

    if (err instanceof ValidationError && err.details) {
      body['details'] = err.details;
    }

    return c.json(body, err.statusCode as 400);
  }

  // Unexpected error — log but do NOT expose to client
  console.error('[UNHANDLED_ERROR]', {
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  return c.json(
    {
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    500,
  );
};
