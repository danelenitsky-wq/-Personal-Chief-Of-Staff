import { NotFoundError, ValidationError } from "@/services/errors";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a server action body, turning domain errors into a user-facing message. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { ok: false, error: error.message };
    }
    console.error("[action] unexpected error", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
