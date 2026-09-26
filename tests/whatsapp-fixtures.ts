/** Payload shapes copied from Meta's WhatsApp Cloud API webhook docs. */
export function textPayload(opts: { from: string; id: string; body: string; timestamp?: string }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550009999", phone_number_id: "PHONE_NUMBER_ID" },
              contacts: [{ profile: { name: "Dany" }, wa_id: opts.from }],
              messages: [
                { from: opts.from, id: opts.id, timestamp: opts.timestamp ?? "1790323200", type: "text", text: { body: opts.body } },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function audioPayload(from: string, id: string) {
  const p = textPayload({ from, id, body: "" });
  p.entry[0].changes[0].value.messages = [
    { from, id, timestamp: "1790323200", type: "audio", audio: { id: "MEDIA_ID", mime_type: "audio/ogg; codecs=opus" } } as never,
  ];
  return p;
}

export function statusPayload() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550009999", phone_number_id: "PHONE_NUMBER_ID" },
              statuses: [{ id: "wamid.OUT", status: "delivered", timestamp: "1790323201", recipient_id: "15550100001" }],
            },
          },
        ],
      },
    ],
  };
}
