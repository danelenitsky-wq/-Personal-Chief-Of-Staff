#!/usr/bin/env node
/**
 * Sends a signed, Meta-shaped webhook to the local app, as if a WhatsApp
 * message arrived. Useful before a Meta app exists.
 *
 *   node scripts/simulate-whatsapp.mjs "Call the doctor tomorrow"
 *   node scripts/simulate-whatsapp.mjs --from 972501234567 --url http://localhost:3000 "hello"
 *   node scripts/simulate-whatsapp.mjs --verify      # test the GET handshake
 *
 * Reads WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN from the environment
 * (load .env.local first, e.g. `node --env-file=.env.local scripts/...`).
 * The default sender is the demo user's fictional number.
 */
import { createHmac, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const verify = args.includes("--verify") && args.splice(args.indexOf("--verify"), 1);
const url = flag("--url", "http://localhost:3000") + "/api/whatsapp";
const from = flag("--from", "15550100001");
const text = args.join(" ") || "hello";

if (verify) {
  const token = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const res = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=challenge-123`);
  console.log(res.status, await res.text());
  process.exit(res.ok ? 0 : 1);
}

const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{
    id: "WABA_ID",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "15550009999", phone_number_id: "PHONE_NUMBER_ID" },
        contacts: [{ profile: { name: "Simulator" }, wa_id: from }],
        messages: [{ from, id: `wamid.sim.${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
      },
    }],
  }],
});

const headers = { "Content-Type": "application/json" };
const secret = process.env.WHATSAPP_APP_SECRET;
if (secret) headers["X-Hub-Signature-256"] = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

const res = await fetch(url, { method: "POST", headers, body });
console.log(res.status, await res.text());
