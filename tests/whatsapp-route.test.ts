import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/whatsapp/route";
import { signBody } from "@/lib/whatsapp/webhook";
import { DEMO_PHONE } from "@/lib/db/memory/seed";
import { textPayload } from "./whatsapp-fixtures";

const URL_BASE = "http://localhost/api/whatsapp";

describe("/api/whatsapp route (demo mode)", () => {
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
  });
  afterAll(() => {
    process.env = saved;
  });

  it("GET completes Meta's verification handshake", async () => {
    const ok = await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=987`));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("987");
    const bad = await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=987`));
    expect(bad.status).toBe(403);
  });

  it("POST rejects unsigned or tampered requests", async () => {
    const body = JSON.stringify(textPayload({ from: DEMO_PHONE.slice(1), id: "wamid.r1", body: "hi" }));
    const unsigned = await POST(new NextRequest(URL_BASE, { method: "POST", body }));
    expect(unsigned.status).toBe(401);
    const tampered = await POST(
      new NextRequest(URL_BASE, { method: "POST", body: body.replace("hi", "yo"), headers: { "x-hub-signature-256": signBody(body, "app-secret") } }),
    );
    expect(tampered.status).toBe(401);
  });

  it("POST accepts a signed message from the demo user", async () => {
    const body = JSON.stringify(textPayload({ from: DEMO_PHONE.slice(1), id: "wamid.r2", body: "Call doctor tomorrow" }));
    const res = await POST(
      new NextRequest(URL_BASE, { method: "POST", body, headers: { "x-hub-signature-256": signBody(body, "app-secret") } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 1 });
  });
});
