/**
 * Structured JSON logging. Values under sensitive keys are redacted and
 * phone numbers are masked, so logs never carry tokens or full numbers.
 */
type Fields = Record<string, unknown>;

const SECRET_KEY = /token|secret|password|authorization|api[_-]?key/i;
const PHONE_KEY = /^(to|from|phone|phoneNumber)$/;

export function maskPhone(value: string): string {
  return value.length > 6 ? `${value.slice(0, 4)}…${value.slice(-3)}` : "…";
}

export function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY.test(key)) out[key] = "[redacted]";
    else if (PHONE_KEY.test(key) && typeof value === "string") out[key] = maskPhone(value);
    else if (value instanceof Error) out[key] = value.message;
    else out[key] = value;
  }
  return out;
}

function write(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...redact(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
