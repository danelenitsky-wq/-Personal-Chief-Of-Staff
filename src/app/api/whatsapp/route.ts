import { NextResponse, type NextRequest } from "next/server";
import { parseWebhookPayload, verifySignature, verifySubscription } from "@/lib/whatsapp/webhook";
import { senderFromEnv } from "@/lib/whatsapp/sender";
import { getWebhookRepositories } from "@/lib/container";
import { createWhatsAppService } from "@/services/whatsapp-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Meta's one-time subscription handshake. */
export async function GET(request: NextRequest) {
  const result = verifySubscription(request.nextUrl.searchParams, process.env.WHATSAPP_VERIFY_TOKEN);
  if (!result.ok) {
    logger.warn("whatsapp.verify.rejected");
    return new NextResponse("Forbidden", { status: 403 });
  }
  logger.info("whatsapp.verify.ok");
  return new NextResponse(result.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/**
 * Incoming messages. Answers 200 once the request is authentic, even when
 * handling a message fails, because Meta retries non-200 responses and would
 * redeliver the whole batch. Failures are logged and stored instead.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret) {
    if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
      logger.warn("whatsapp.signature.invalid");
      return new NextResponse("Invalid signature", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Never accept unsigned webhooks in production.
    logger.error("whatsapp.signature.not_configured");
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const messages = parseWebhookPayload(body);
  if (messages === null) return new NextResponse("Unsupported payload", { status: 400 });

  const service = createWhatsAppService({ repos: getWebhookRepositories(), sender: senderFromEnv() });
  for (const message of messages) {
    try {
      const outcome = await service.handleInbound(message);
      logger.info("whatsapp.handled", outcome);
    } catch (error) {
      logger.error("whatsapp.handle.error", { externalId: message.externalId, error: error as Error });
    }
  }
  return NextResponse.json({ received: messages.length });
}
