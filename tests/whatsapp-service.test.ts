import { describe, expect, it } from "vitest";
import { createMemoryRepositories, defaultProfile, emptyStore } from "@/lib/db/memory/store";
import { createWhatsAppService, REPLIES, type Responder } from "@/services/whatsapp-service";
import type { MessageSender, SendResult } from "@/lib/whatsapp/sender";
import { parseWebhookPayload } from "@/lib/whatsapp/webhook";
import { audioPayload, textPayload } from "./whatsapp-fixtures";

const PHONE = "+972501234567";

function setup(opts: { sendResult?: SendResult; responder?: Responder } = {}) {
  const store = emptyStore();
  store.profiles.push({ ...defaultProfile("user-a", "2026-09-01T00:00:00Z"), phoneNumber: PHONE });
  store.profiles.push({ ...defaultProfile("user-b", "2026-09-01T00:00:00Z"), phoneNumber: "+15550000002" });
  const sent: { to: string; body: string }[] = [];
  const sender: MessageSender = {
    async sendText(to, body) {
      sent.push({ to, body });
      return opts.sendResult ?? { ok: true, externalId: `wamid.out.${sent.length}`, dryRun: false };
    },
  };
  const repos = createMemoryRepositories(store);
  const service = createWhatsAppService({ repos, sender, responder: opts.responder });
  const inbound = (body: string, id = "wamid.1", from = "972501234567") =>
    parseWebhookPayload(textPayload({ from, id, body }))![0];
  return { store, sent, service, inbound };
}

describe("WhatsApp message pipeline", () => {
  it("identifies the user by phone, stores both messages and replies", async () => {
    const s = setup();
    const outcome = await s.service.handleInbound(s.inbound("Call doctor tomorrow"));
    expect(outcome).toEqual({ status: "processed", externalId: "wamid.1", userId: "user-a", replied: true });
    expect(s.sent).toEqual([{ to: PHONE, body: REPLIES.received }]);
    expect(s.store.conversations.map((m) => [m.userId, m.direction, m.body, m.processingStatus])).toEqual([
      ["user-a", "inbound", "Call doctor tomorrow", "processed"],
      ["user-a", "outbound", REPLIES.received, "processed"],
    ]);
    expect(s.store.conversations[1].externalId).toBe("wamid.out.1");
  });

  it("does not claim any action was taken before the AI exists", async () => {
    const s = setup();
    await s.service.handleInbound(s.inbound("Call doctor tomorrow"));
    expect(s.sent[0].body).not.toMatch(/added|created|scheduled|✓/i);
    expect(s.store.tasks).toHaveLength(0);
  });

  it("handles a redelivered webhook only once", async () => {
    const s = setup();
    await s.service.handleInbound(s.inbound("hello", "wamid.dup"));
    const again = await s.service.handleInbound(s.inbound("hello", "wamid.dup"));
    expect(again).toEqual({ status: "duplicate", externalId: "wamid.dup" });
    expect(s.sent).toHaveLength(1);
    expect(s.store.conversations.filter((m) => m.direction === "inbound")).toHaveLength(1);
  });

  it("tells unknown numbers how to connect and stores nothing", async () => {
    const s = setup();
    const outcome = await s.service.handleInbound(s.inbound("hi", "wamid.x", "447700900123"));
    expect(outcome).toMatchObject({ status: "unknown_user" });
    expect(s.sent[0]).toEqual({ to: "+447700900123", body: REPLIES.unknownUser });
    expect(s.store.conversations).toHaveLength(0);
  });

  it("keeps each user's conversation separate", async () => {
    const s = setup();
    await s.service.handleInbound(s.inbound("from a", "wamid.a"));
    await s.service.handleInbound(s.inbound("from b", "wamid.b", "15550000002"));
    expect(s.store.conversations.filter((m) => m.userId === "user-a").map((m) => m.body)).toEqual(["from a", REPLIES.received]);
    expect(s.store.conversations.filter((m) => m.userId === "user-b").map((m) => m.body)).toEqual(["from b", REPLIES.received]);
  });

  it("replies to voice notes without dropping them", async () => {
    const s = setup();
    const msg = parseWebhookPayload(audioPayload("972501234567", "wamid.voice"))![0];
    await s.service.handleInbound(msg);
    expect(s.sent[0].body).toBe(REPLIES.voiceNotYet);
    expect(s.store.conversations[0]).toMatchObject({ messageType: "audio", direction: "inbound" });
  });

  it("stores the message and sends the rephrase reply when processing fails", async () => {
    const s = setup({ responder: { respond: async () => { throw new Error("model timeout"); } } });
    const outcome = await s.service.handleInbound(s.inbound("Call doctor"));
    expect(outcome.status).toBe("failed");
    expect(s.sent[0].body).toBe(REPLIES.failure);
    expect(s.store.conversations[0]).toMatchObject({ body: "Call doctor", processingStatus: "failed", error: "model timeout" });
  });

  it("records a failed send instead of reporting success", async () => {
    const s = setup({ sendResult: { ok: false, error: "WhatsApp API 401: bad token" } });
    const outcome = await s.service.handleInbound(s.inbound("hello"));
    expect(outcome).toMatchObject({ status: "processed", replied: false });
    expect(s.store.conversations[1]).toMatchObject({ direction: "outbound", processingStatus: "failed", error: "WhatsApp API 401: bad token" });
  });
});
