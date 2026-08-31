import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { env } from "../../config/env";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/**
 * Centralized error handler (spec #36). Never leaks stack traces, DB
 * credentials, or secrets in production; structured {code, message} shape
 * for the frontend either way.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request.", details: err.flatten() },
    });
  }

  // eslint-disable-next-line no-console
  console.error("[unhandled error]", err);

  const message =
    env.APP_ENV === "production"
      ? "An unexpected error occurred."
      : err instanceof Error
      ? err.message
      : "Unknown error";

  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route: ${req.method} ${req.path}` } });
}
