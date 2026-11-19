import type { ValidationErrorItem, ValidationErrorPayload } from '@yng/shared';
import type { RequestHandler } from 'express';
import type { ZodError, ZodTypeAny } from 'zod';
import { sendError } from '../utils/response.js';

export interface ValidateSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function formatZodIssues(
  error: ZodError,
  target: 'body' | 'query' | 'params'
): ValidationErrorItem[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : target,
    message: issue.message,
  }));
}

export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req, res, next) => {
    const collectedErrors: ValidationErrorItem[] = [];

    if (schemas.params) {
      const parsed = schemas.params.safeParse(req.params);
      if (!parsed.success) {
        collectedErrors.push(...formatZodIssues(parsed.error, 'params'));
      } else {
        req.params = parsed.data as Record<string, string>;
      }
    }

    if (schemas.query) {
      const parsed = schemas.query.safeParse(req.query);
      if (!parsed.success) {
        collectedErrors.push(...formatZodIssues(parsed.error, 'query'));
      } else {
        req.query = parsed.data as typeof req.query;
      }
    }

    if (schemas.body) {
      const parsed = schemas.body.safeParse(req.body);
      if (!parsed.success) {
        collectedErrors.push(...formatZodIssues(parsed.error, 'body'));
      } else {
        req.body = parsed.data;
      }
    }

    if (collectedErrors.length > 0) {
      return sendError<ValidationErrorPayload>(res, {
        status: 400,
        message: collectedErrors[0]?.message || 'Data permintaan tidak valid.',
        data: { errors: collectedErrors },
      });
    }

    return next();
  };
}
