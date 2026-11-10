import type { ZodType } from 'zod';

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    status: number,
    message: string,
    options: { code?: string; fieldErrors?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
  }
}

export function parseWith<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }

  throw new HttpError(400, 'Revisa los datos del formulario.', {
    code: 'VALIDATION_ERROR',
    fieldErrors,
  });
}
