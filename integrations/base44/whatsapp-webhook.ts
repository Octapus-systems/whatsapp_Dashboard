/**
 * Base44 backend function: bridges OpenWA <-> your Base44 AI agent.
 *
 * Deploy as a Base44 backend function, then register its public URL as an
 * OpenWA webhook (see integrations/base44/README.md).
 *
 * Secrets this function expects (set via `base44 secrets set`):
 *   OPENWA_API_URL     e.g. https://wa.yourdomain.com/api
 *   OPENWA_API_KEY     the OpenWA master API key
 *   OPENWA_SESSION_ID  the WhatsApp session to reply through
 *   OPENWA_WEBHOOK_SECRET  same secret used when registering the webhook
 */

const OPENWA_API_URL = Deno.env.get('OPENWA_API_URL')!;
const OPENWA_API_KEY = Deno.env.get('OPENWA_API_KEY')!;
const OPENWA_SESSION_ID = Deno.env.get('OPENWA_SESSION_ID')!;
const WEBHOOK_SECRET = Deno.env.get('OPENWA_WEBHOOK_SECRET')!;

/**
 * OpenWA signs the raw body with HMAC-SHA256 and sends `sha256=<hex>`.
 * Without this check anyone who learns the URL can impersonate OpenWA.
 */
async function isSignatureValid(rawBody: string, header: string | null): Promise<boolean> {
  if (!header) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected =
    'sha256=' +
    Array.from(new Uint8Array(mac))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

  // Constant-time compare so a timing side channel can't leak the secret.
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  }
  return diff === 0;
}

async function sendWhatsAppText(chatId: string, text: string): Promise<void> {
  const res = await fetch(`${OPENWA_API_URL}/sessions/${OPENWA_SESSION_ID}/messages/send-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': OPENWA_API_KEY,
    },
    body: JSON.stringify({ chatId, text }),
  });

  if (!res.ok) {
    throw new Error(`OpenWA send-text failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * TODO: replace this with a call to your Base44 agent.
 *
 * I left this as a plain function because I don't know your agent's name or
 * input shape — wire it to whatever your agent exposes and return the reply text.
 */
async function runAgent(incomingText: string, from: string): Promise<string> {
  return `You said: ${incomingText}`;
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Read the body as text once — the signature covers the exact bytes sent.
  const rawBody = await req.text();

  if (!(await isSignatureValid(rawBody, req.headers.get('x-openwa-signature')))) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { event, data } = JSON.parse(rawBody);

  // Only inbound messages are actionable. Everything else is acknowledged so
  // OpenWA doesn't burn its 3 retries on events we intentionally ignore.
  if (event !== 'message.received') {
    return Response.json({ ignored: event }, { status: 200 });
  }

  const { body, from, chatId, fromMe, isGroup } = data ?? {};

  // fromMe would make the agent answer its own replies, forever.
  if (fromMe || isGroup || !body) {
    return Response.json({ skipped: true }, { status: 200 });
  }

  try {
    const reply = await runAgent(body, from);
    if (reply) await sendWhatsAppText(chatId, reply);
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('agent/send failed', err);
    // 500 tells OpenWA to retry (3 attempts, 5s apart).
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
