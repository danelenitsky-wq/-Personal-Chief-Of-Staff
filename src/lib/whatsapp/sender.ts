/**
 * Outbound WhatsApp messages via the Cloud API. When credentials are not
 * configured a dry-run sender is used, so the pipeline still works (and
 * logs what it would have sent) in local development and demo mode.
 */
export type SendResult = { ok: true; externalId: string | null; dryRun: boolean } | { ok: false; error: string };

export interface MessageSender {
  sendText(to: string, body: string): Promise<SendResult>;
}

export const GRAPH_API_VERSION = "v21.0";

export function createCloudApiSender(opts: {
  accessToken: string;
  phoneNumberId: string;
  fetchImpl?: typeof fetch;
}): MessageSender {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async sendText(to, body) {
      try {
        const res = await fetchImpl(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${opts.phoneNumberId}/messages`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: to.replace(/^\+/, ""),
              type: "text",
              text: { body, preview_url: false },
            }),
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          messages?: { id: string }[];
          error?: { message?: string; code?: number };
        };
        if (!res.ok) {
          return { ok: false, error: `WhatsApp API ${res.status}: ${json.error?.message ?? "unknown error"}` };
        }
        return { ok: true, externalId: json.messages?.[0]?.id ?? null, dryRun: false };
      } catch (error) {
        return { ok: false, error: `WhatsApp API request failed: ${(error as Error).message}` };
      }
    },
  };
}

export const dryRunSender: MessageSender = {
  // Nothing is sent; the pipeline logs the reply with dryRun: true.
  async sendText() {
    return { ok: true, externalId: null, dryRun: true };
  },
};

export function senderFromEnv(): MessageSender {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return accessToken && phoneNumberId ? createCloudApiSender({ accessToken, phoneNumberId }) : dryRunSender;
}
