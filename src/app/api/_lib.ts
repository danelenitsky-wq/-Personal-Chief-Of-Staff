import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getServices } from "@/lib/container";
import type { Services } from "@/services";
import { NotFoundError, ValidationError } from "@/services/errors";

type Handler = (ctx: { userId: string; services: Services }) => Promise<unknown>;

/** Authenticates, runs the handler, and maps domain errors to HTTP codes. */
export async function handle(fn: Handler, status = 200) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await fn({ userId: user.id, services: await getServices() });
    return data === undefined ? new NextResponse(null, { status: 204 }) : NextResponse.json({ data }, { status });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("[api] unexpected error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be JSON");
  }
}
