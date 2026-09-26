/**
 * Picks the WhatsApp responder: the OpenAI orchestrator when OPENAI_API_KEY
 * is set, otherwise the rules-based fallback. Both run the same validated
 * tools against the same services.
 */
import type { Repositories } from "@/lib/db/types";
import { createServices } from "@/services";
import { systemClock, type Clock } from "@/services/clock";
import type { Responder } from "@/services/whatsapp-service";
import { createAiResponder, createOpenAIClient, type LlmClient } from "./orchestrator";
import { createRulesResponder } from "./rules";
import type { ToolContext } from "./tools";

export type ResponderMode = "openai" | "rules";

export function createResponder(deps: {
  repos: Repositories;
  env?: Record<string, string | undefined>;
  llm?: LlmClient;
  clock?: Clock;
}): { responder: Responder; mode: ResponderMode } {
  const env = deps.env ?? process.env;
  const clock = deps.clock ?? systemClock;
  const services = createServices(deps.repos, { clock });
  const buildContext = async (userId: string): Promise<ToolContext> => ({
    userId,
    profile: await services.profiles.getProfile(userId),
    services,
    now: clock(),
  });

  const llm =
    deps.llm ??
    (env.OPENAI_API_KEY ? createOpenAIClient({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || undefined }) : null);
  if (llm) return { responder: createAiResponder({ llm, buildContext }), mode: "openai" };
  return { responder: createRulesResponder({ buildContext }), mode: "rules" };
}
