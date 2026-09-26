/**
 * WhatsApp message pipeline (brief §23, steps 1-3, 10-11):
 * dedupe → identify user by phone → store inbound → build reply → send →
 * store outbound. Phase 3 plugs the AI orchestrator in as the Responder.
 */
import type { UserProfile } from "@/types/domain";
import type { Repositories } from "@/lib/db/types";
import type { InboundMessage } from "@/lib/whatsapp/webhook";
import type { MessageSender } from "@/lib/whatsapp/sender";
import { logger } from "@/lib/logger";

export type ResponderContext = { user: UserProfile; message: InboundMessage & { text: string } };

/** Produces the reply text for a text message. */
export interface Responder {
  respond(ctx: ResponderContext): Promise<string>;
}

export const REPLIES = {
  unknownUser:
    "This number isn't linked to a Chief of Staff account yet. Add it in the dashboard under Settings → WhatsApp number.",
  voiceNotYet: "Voice notes are coming soon. Send it as text for now.",
  unsupported: "I can only read text messages for now.",
  failure: "I couldn't process that correctly. Try rephrasing it.",
  help: "I'm your Chief of Staff. Soon you'll be able to text me things like \"Call the doctor tomorrow\" and I'll take care of them.",
  received: "Got it. I can't act on messages yet, but this one is saved.",
} as const;

/**
 * Phase 2 responder: no AI yet, so it never claims to have created or
 * changed anything. It only acknowledges.
 */
export const phase2Responder: Responder = {
  async respond({ message }) {
    const text = message.text.trim().toLowerCase();
    if (text === "help" || text === "?" || text === "hi" || text === "hello") return REPLIES.help;
    return REPLIES.received;
  },
};

export type InboundOutcome =
  | { status: "duplicate"; externalId: string }
  | { status: "unknown_user"; externalId: string; replied: boolean }
  | { status: "processed" | "failed"; externalId: string; userId: string; replied: boolean };

export function createWhatsAppService(deps: {
  repos: Repositories;
  sender: MessageSender;
  responder?: Responder;
}) {
  const responder = deps.responder ?? phase2Responder;
  const { repos, sender } = deps;

  async function sendAndStore(userId: string | null, to: string, body: string): Promise<boolean> {
    const result = await sender.sendText(to, body);
    if (result.ok) logger.info("whatsapp.outbound", { to, body, dryRun: result.dryRun });
    else logger.error("whatsapp.outbound.failed", { to, error: result.error });

    if (userId) {
      await repos.conversations.insert(userId, {
        direction: "outbound",
        channel: "whatsapp",
        messageType: "text",
        body,
        externalId: result.ok ? result.externalId : null,
        processingStatus: result.ok ? "processed" : "failed",
        error: result.ok ? null : result.error,
      });
    }
    return result.ok;
  }

  async function replyFor(user: UserProfile, message: InboundMessage): Promise<string> {
    if (message.kind === "audio") return REPLIES.voiceNotYet;
    if (message.text === null || message.text.trim() === "") return REPLIES.unsupported;
    return responder.respond({ user, message: { ...message, text: message.text } });
  }

  return {
    async handleInbound(message: InboundMessage): Promise<InboundOutcome> {
      logger.info("whatsapp.inbound", {
        from: message.from,
        kind: message.kind,
        externalId: message.externalId,
        body: message.text,
      });

      // Meta retries deliveries; the same wamid must only be handled once.
      if (await repos.conversations.findByExternalId(message.externalId)) {
        return { status: "duplicate", externalId: message.externalId };
      }

      const user = await repos.profiles.findByPhone(message.from);
      if (!user) {
        logger.warn("whatsapp.unknown_sender", { from: message.from });
        const replied = await sendAndStore(null, message.from, REPLIES.unknownUser);
        return { status: "unknown_user", externalId: message.externalId, replied };
      }

      // Store the raw message before anything that can fail, so nothing is lost.
      let inboundId: string;
      try {
        const stored = await repos.conversations.insert(user.id, {
          direction: "inbound",
          channel: "whatsapp",
          messageType: message.kind,
          body: message.text,
          externalId: message.externalId,
          processingStatus: "received",
        });
        inboundId = stored.id;
      } catch (error) {
        // A concurrent delivery of the same message won the unique constraint.
        if (await repos.conversations.findByExternalId(message.externalId)) {
          return { status: "duplicate", externalId: message.externalId };
        }
        throw error;
      }

      let reply: string;
      let failed = false;
      try {
        reply = await replyFor(user, message);
      } catch (error) {
        logger.error("whatsapp.processing_failed", { externalId: message.externalId, error: error as Error });
        reply = REPLIES.failure;
        failed = true;
        await repos.conversations.update(user.id, inboundId, {
          processingStatus: "failed",
          error: (error as Error).message,
        });
      }

      const replied = await sendAndStore(user.id, message.from, reply);
      if (!failed) await repos.conversations.update(user.id, inboundId, { processingStatus: "processed" });
      return { status: failed ? "failed" : "processed", externalId: message.externalId, userId: user.id, replied };
    },
  };
}

export type WhatsAppService = ReturnType<typeof createWhatsAppService>;
