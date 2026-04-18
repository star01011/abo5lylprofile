const crypto = require("crypto");

function verifyToken(token, secret) {
  try {
    const [header, body, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

  const authHeader = event.headers["authorization"] || "";
  const token = authHeader.replace("Bearer ", "");
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || !verifyToken(token, jwtSecret)) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid" }) };
  }

  const { ip, action } = body;
  if (!ip || !["ban", "unban"].includes(action)) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_params" }) };
  }

  const current = (process.env.BANNED_IPS || "").split(",").map((b) => b.trim()).filter(Boolean);

  let updated;
  if (action === "ban") {
    if (!current.includes(ip)) current.push(ip);
    updated = current;
  } else {
    updated = current.filter((b) => b !== ip);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      banned: updated,
      note: "Update BANNED_IPS in Netlify env vars with: " + updated.join(","),
    }),
  };
};
