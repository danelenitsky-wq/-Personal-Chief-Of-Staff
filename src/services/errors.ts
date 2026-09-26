import type { ZodError } from "zod";

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ValidationError";
  }

  static fromZod(error: ZodError): ValidationError {
    const issues = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return new ValidationError(issues.map((i) => i.message).join("; "), issues);
  }
}

/** Parses input with a Zod schema, throwing a ValidationError on failure. */
export function validate<T>(
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: ZodError } },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success) throw ValidationError.fromZod(result.error);
  return result.data;
}
