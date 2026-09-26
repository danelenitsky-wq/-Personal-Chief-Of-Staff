/**
 * WhatsApp message pipeline (brief §23, steps 1-3, 10-11):
 * dedupe → identify user by phone → store inbound → build reply → send →
 * store outbound. Phase 3 plugs the AI orchestrator in as the Responder.
 */
import type { ConversationMessage, ConversationMetadata, UserProfile } from "@/types/domain";
import type { Repositories } from "@/lib/db/types";
import type { InboundMessage } from "@/lib/whatsapp/webhook";
import type { MessageSender } from "@/lib/whatsapp/sender";
import { logger } from "@/lib/logger";

export type ResponderContext = {
  user: UserProfile;
  message: InboundMessage & { text: string };
  /** Earlier messages in this conversation, newest first (current one excluded). */
  history: ConversationMessage[];
};

export type ResponderResult = {
  reply: string;
  /** Detected intent, stored on the inbound message (brief §17). */
  intent?: string;
  /** Stored on the reply so follow-ups ("move it", "2") can be resolved. */
  metadata?: ConversationMetadata;
};

/** Produces the reply for a text message. */
export interface Responder {
  respond(ctx: ResponderContext): Promise<ResponderResult>;
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
    if (text === "help" || text === "?" || text === "hi" || text === "hello") return { reply: REPLIES.help };
    return { reply: REPLIES.received };
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

  async function sendAndStore(
    userId: string | null,
    to: string,
    body: string,
    metadata: ConversationMetadata = {},
  ): Promise<boolean> {
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
        metadata,
      });
    }
    return result.ok;
  }

  async function replyFor(user: UserProfile, message: InboundMessage, inboundId: string): Promise<ResponderResult> {
    if (message.kind === "audio") return { reply: REPLIES.voiceNotYet };
    if (message.text === null || message.text.trim() === "") return { reply: REPLIES.unsupported };
    const history = (await repos.conversations.listRecent(user.id, 13)).filter((m) => m.id !== inboundId).slice(0, 12);
    return responder.respond({ user, message: { ...message, text: message.text }, history });
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

      let result: ResponderResult;
      let failed = false;
      try {
        result = await replyFor(user, message, inboundId);
        logger.info("whatsapp.intent", { externalId: message.externalId, intent: result.intent ?? null });
      } catch (error) {
        logger.error("whatsapp.processing_failed", { externalId: message.externalId, error: error as Error });
        result = { reply: REPLIES.failure };
        failed = true;
        await repos.conversations.update(user.id, inboundId, {
          processingStatus: "failed",
          error: (error as Error).message,
        });
      }

      const replied = await sendAndStore(user.id, message.from, result.reply, result.metadata);
      if (!failed) {
        await repos.conversations.update(user.id, inboundId, {
          processingStatus: "processed",
          intent: result.intent ?? null,
        });
      }
      return { status: failed ? "failed" : "processed", externalId: message.externalId, userId: user.id, replied };
    },
  };
}

export type WhatsAppService = ReturnType<typeof createWhatsAppService>;
