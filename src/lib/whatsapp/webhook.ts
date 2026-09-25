/**
 * Meta WhatsApp Cloud API webhook: verification handshake, signature check
 * and payload parsing. Pure functions, no I/O, so they are fully testable.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** GET handshake: Meta sends hub.mode, hub.verify_token and hub.challenge. */
export function verifySubscription(
  params: URLSearchParams,
  expectedToken: string | undefined,
): { ok: true; challenge: string } | { ok: false } {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (!expectedToken || mode !== "subscribe" || !token || challenge === null) return { ok: false };
  return safeEqual(token, expectedToken) ? { ok: true, challenge } : { ok: false };
}

/**
 * POST signature: X-Hub-Signature-256 is "sha256=<hex HMAC of the raw body
 * with the Meta app secret>". Must be computed over the exact raw bytes.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header.slice("sha256=".length), expected);
}

export function signBody(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// --- Payload schema (only the parts we use; unknown keys are ignored) ---

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  audio: z.object({ id: z.string(), mime_type: z.string().optional() }).optional(),
  interactive: z
    .object({
      type: z.string(),
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  button: z.object({ text: z.string(), payload: z.string().optional() }).optional(),
});

const payloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional(),
            messages: z.array(messageSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

export type InboundKind = "text" | "audio" | "interactive" | "other";

export type InboundMessage = {
  externalId: string;
  /** E.164 with leading "+" */
  from: string;
  kind: InboundKind;
  text: string | null;
  audioMediaId: string | null;
  timestamp: string;
  phoneNumberId: string | null;
  contactName: string | null;
};

/** WhatsApp sends "972501234567"; profiles store "+972501234567". */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

/**
 * Extracts user messages. Status callbacks (sent/delivered/read) and other
 * fields yield no messages. Returns null when the body isn't a WhatsApp payload.
 */
export function parseWebhookPayload(body: unknown): InboundMessage[] | null {
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return null;

  const out: InboundMessage[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const { metadata, contacts, messages } = change.value;
      for (const m of messages ?? []) {
        const kind: InboundKind =
          m.type === "text" ? "text" : m.type === "audio" ? "audio" : m.type === "interactive" || m.type === "button" ? "interactive" : "other";
        const text =
          m.text?.body ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          m.button?.text ??
          null;
        out.push({
          externalId: m.id,
          from: normalizePhone(m.from),
          kind,
          text,
          audioMediaId: m.audio?.id ?? null,
          timestamp: new Date(Number(m.timestamp) * 1000).toISOString(),
          phoneNumberId: metadata?.phone_number_id ?? null,
          contactName: contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null,
        });
      }
    }
  }
  return out;
}
