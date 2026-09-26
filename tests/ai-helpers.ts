import { createWhatsAppService } from "@/services/whatsapp-service";
import { createResponder } from "@/lib/ai/responder";
import type { LlmClient } from "@/lib/ai/orchestrator";
import type { MessageSender } from "@/lib/whatsapp/sender";
import { parseWebhookPayload } from "@/lib/whatsapp/webhook";
import { textPayload } from "./whatsapp-fixtures";
import { NOW, setup, USER_A } from "./helpers";

export const PHONE_A = "+972501234567";

/** The full WhatsApp pipeline on the memory store, with a fixed clock. */
export function chat(opts: { llm?: LlmClient; now?: Date } = {}) {
  const env = setup(opts.now ?? NOW);
  env.store.profiles.find((p) => p.id === USER_A)!.phoneNumber = PHONE_A;
  const sent: string[] = [];
  const sender: MessageSender = {
    async sendText(_to, body) {
      sent.push(body);
      return { ok: true, externalId: `wamid.out.${sent.length}`, dryRun: false };
    },
  };
  const { responder, mode } = createResponder({ repos: env.repos, env: {}, llm: opts.llm, clock: () => opts.now ?? NOW });
  const service = createWhatsAppService({ repos: env.repos, sender, responder });
  let n = 0;
  return {
    ...env,
    mode,
    sent,
    /** Sends a WhatsApp text from user A and returns the reply. */
    async say(body: string): Promise<string> {
      n += 1;
      const msg = parseWebhookPayload(textPayload({ from: PHONE_A.slice(1), id: `wamid.in.${n}`, body }))![0];
      await service.handleInbound(msg);
      return sent[sent.length - 1];
    },
    tasks: () => env.store.tasks.filter((t) => t.userId === USER_A),
    inbound: () => env.store.conversations.filter((m) => m.direction === "inbound"),
  };
}
