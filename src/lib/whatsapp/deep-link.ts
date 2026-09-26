/**
 * "Ask Agent" deep link: opens WhatsApp with a prefilled message to the
 * Chief of Staff number. Without a configured number WhatsApp asks the
 * user to pick a chat.
 */
export function askAgentLink(message: string): string {
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER ?? "").replace(/\D/g, "");
  const base = number ? `https://wa.me/${number}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}
