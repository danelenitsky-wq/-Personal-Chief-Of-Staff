import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  parseWebhookPayload,
  signBody,
  verifySignature,
  verifySubscription,
} from "@/lib/whatsapp/webhook";
import { createCloudApiSender } from "@/lib/whatsapp/sender";
import { redact } from "@/lib/logger";
import { audioPayload, statusPayload, textPayload } from "./whatsapp-fixtures";

describe("WhatsApp webhook verification", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);

  it("echoes the challenge when the verify token matches", () => {
    expect(
      verifySubscription(params({ "hub.mode": "subscribe", "hub.verify_token": "s3cret", "hub.challenge": "12345" }), "s3cret"),
    ).toEqual({ ok: true, challenge: "12345" });
  });

  it("rejects a wrong token, wrong mode, or missing configuration", () => {
    const good = { "hub.mode": "subscribe", "hub.verify_token": "s3cret", "hub.challenge": "1" };
    expect(verifySubscription(params({ ...good, "hub.verify_token": "nope" }), "s3cret").ok).toBe(false);
    expect(verifySubscription(params({ ...good, "hub.mode": "unsubscribe" }), "s3cret").ok).toBe(false);
    expect(verifySubscription(params(good), undefined).ok).toBe(false);
  });

  it("accepts only a valid HMAC-SHA256 signature over the raw body", () => {
    const body = JSON.stringify(textPayload({ from: "15550100001", id: "wamid.1", body: "hi" }));
    const sig = signBody(body, "app-secret");
    expect(verifySignature(body, sig, "app-secret")).toBe(true);
    expect(verifySignature(body, sig, "other-secret")).toBe(false);
    expect(verifySignature(body + " ", sig, "app-secret")).toBe(false);
    expect(verifySignature(body, null, "app-secret")).toBe(false);
    expect(verifySignature(body, "sha256=abc", "app-secret")).toBe(false);
  });
});

describe("WhatsApp payload parsing", () => {
  it("extracts text messages with a normalized phone number", () => {
    const [m] = parseWebhookPayload(textPayload({ from: "972501234567", id: "wamid.A", body: "Call doctor tomorrow" }))!;
    expect(m).toMatchObject({
      externalId: "wamid.A",
      from: "+972501234567",
      kind: "text",
      text: "Call doctor tomorrow",
      contactName: "Dany",
      phoneNumberId: "PHONE_NUMBER_ID",
      timestamp: "2026-09-25T08:00:00.000Z",
    });
  });

  it("recognises voice notes", () => {
    const [m] = parseWebhookPayload(audioPayload("972501234567", "wamid.V"))!;
    expect(m).toMatchObject({ kind: "audio", audioMediaId: "MEDIA_ID", text: null });
  });

  it("ignores delivery status callbacks", () => {
    expect(parseWebhookPayload(statusPayload())).toEqual([]);
  });

  it("rejects bodies that are not WhatsApp payloads", () => {
    expect(parseWebhookPayload({ hello: "world" })).toBeNull();
    expect(parseWebhookPayload({ object: "page", entry: [] })).toBeNull();
  });

  it("normalizes phone formats", () => {
    expect(normalizePhone("972 50-123-4567")).toBe("+972501234567");
    expect(normalizePhone("+15550100001")).toBe("+15550100001");
  });
});

describe("WhatsApp Cloud API sender", () => {
  it("posts the documented request and returns the message id", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.OUT" }] }), { status: 200 });
    }) as typeof fetch;
    const sender = createCloudApiSender({ accessToken: "tok", phoneNumberId: "123", fetchImpl });
    expect(await sender.sendText("+972501234567", "✓ Added.")).toEqual({ ok: true, externalId: "wamid.OUT", dryRun: false });
    expect(calls[0].url).toBe("https://graph.facebook.com/v21.0/123/messages");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({
      messaging_product: "whatsapp",
      to: "972501234567",
      type: "text",
      text: { body: "✓ Added." },
    });
  });

  it("reports API errors instead of pretending the message was sent", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: "Invalid OAuth access token" } }), { status: 401 })) as unknown as typeof fetch;
    const sender = createCloudApiSender({ accessToken: "bad", phoneNumberId: "123", fetchImpl });
    const result = await sender.sendText("+1555", "hi");
    expect(result).toEqual({ ok: false, error: "WhatsApp API 401: Invalid OAuth access token" });
  });
});

describe("log redaction", () => {
  it("never logs tokens or full phone numbers", () => {
    expect(redact({ accessToken: "EAAG...", from: "+972501234567", body: "hi" })).toEqual({
      accessToken: "[redacted]",
      from: "+972…567",
      body: "hi",
    });
  });
});
