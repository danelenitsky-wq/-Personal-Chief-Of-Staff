import type { CreateWaitingForInput } from "@/lib/validation/schemas";
import { handle, readJson } from "../_lib";

export async function GET() {
  return handle(({ userId, services }) => services.waiting.listWaiting(userId));
}

export async function POST(request: Request) {
  return handle(async ({ userId, services }) =>
    services.waiting.createWaitingFor(userId, (await readJson(request)) as CreateWaitingForInput), 201);
}
