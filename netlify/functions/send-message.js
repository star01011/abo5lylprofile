const https = require("https");

const RATE_LIMIT = {};
const MAX_MSGS = 3;
const WINDOW_MS = 5 * 60 * 1000;

function getClientIP(event) {
  return (
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers["x-real-ip"] ||
    "unknown"
  );
}

function checkRateLimit(ip) {
  const now = Date.now();
  if (!RATE_LIMIT[ip]) {
    RATE_LIMIT[ip] = { count: 1, firstTime: now };
    return true;
  }
  const entry = RATE_LIMIT[ip];
  if (now - entry.firstTime > WINDOW_MS) {
    RATE_LIMIT[ip] = { count: 1, firstTime: now };
    return true;
  }
  if (entry.count >= MAX_MSGS) return false;
  entry.count++;
  return true;
}

function isBanned(ip) {
  const banned = process.env.BANNED_IPS || "";
  return banned.split(",").map((b) => b.trim()).filter(Boolean).includes(ip);
}

function httpsRequest(options, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function sendWebhook(webhookUrl, message) {
  const u = new URL(webhookUrl);
  const payload = JSON.stringify({ content: message });
  const res = await httpsRequest(
    {
      hostname: u.hostname,
      path: u.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    payload
  );
  if (res.status < 200 || res.status > 299) {
    throw new Error(`Webhook status ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function sendDiscordDM(userId, message, token) {
  // Step 1: open DM channel
  const dmPayload = JSON.stringify({ recipient_id: userId });
  const dmRes = await httpsRequest(
    {
      hostname: "discord.com",
      path: "/api/v10/users/@me/channels",
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dmPayload),
      },
    },
    dmPayload
  );

  if (!dmRes.body?.id) {
    throw new Error(`DM channel failed: ${JSON.stringify(dmRes.body)}`);
  }

  const channelId = dmRes.body.id;

  // Step 2: send message
  const msgPayload = JSON.stringify({ content: message });
  const msgRes = await httpsRequest(
    {
      hostname: "discord.com",
      path: `/api/v10/channels/${channelId}/messages`,
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(msgPayload),
      },
    },
    msgPayload
  );

  if (!msgRes.body?.id) {
    throw new Error(`Send message failed: ${JSON.stringify(msgRes.body)}`);
  }

  return msgRes.body;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "method" }) };
  }

  const ip = getClientIP(event);

  if (isBanned(ip)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "banned" }) };
  }

  if (!checkRateLimit(ip)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: "rate_limit" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid" }) };
  }

  const message = (body.message || "").trim();
  if (!message || message.length < 1 || message.length > 500) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid_message" }) };
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  const userId = process.env.DISCORD_USER_ID || "745298901069725717";
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/1482755428843524116/PzxSy51AXJXob9QM16SGp_PiDAY42dQeDk1wN7fo4uZ5B7KPqoa7eXoAUMS21JsHTQL6";

  const formatted = `📩 **Anonymous Message**\n\n${message}\n\n\`IP: ${ip}\``;

  // Try DM first
  if (token) {
    try {
      console.log("Attempting DM to:", userId);
      const result = await sendDiscordDM(userId, formatted, token);
      console.log("DM sent successfully:", result.id);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, method: "dm" }) };
    } catch (dmErr) {
      console.error("DM failed:", dmErr.message);
    }
  } else {
    console.log("No bot token, skipping DM");
  }

  // Fallback to webhook
  try {
    console.log("Trying webhook...");
    await sendWebhook(webhookUrl, formatted);
    console.log("Webhook sent successfully");
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, method: "webhook" }) };
  } catch (whErr) {
    console.error("Webhook failed:", whErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "failed", detail: whErr.message }) };
  }
};
