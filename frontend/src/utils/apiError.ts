import type { ValidationErrorPayload } from '@yng/shared';
import { ApiClientError } from '../services/api';

export interface ParsedApiError {
  message: string;
  details: string[];
}

export function extractApiError(err: unknown, fallback: string): ParsedApiError {
  if (err instanceof ApiClientError) {
    const data = err.data as Partial<ValidationErrorPayload> | null;
    const rawErrors = Array.isArray(data?.errors) ? data.errors : [];
    const details = rawErrors
      .map((item) => item?.message)
      .filter((msg): msg is string => typeof msg === 'string' && msg.trim().length > 0);

    return {
      message: err.message || fallback,
      details: details.length > 1 ? details : [],
    };
  }

  if (err instanceof Error && err.message) {
    return { message: err.message, details: [] };
  }

  return { message: fallback, details: [] };
}
