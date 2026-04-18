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
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "" };

  const authHeader = event.headers["authorization"] || "";
  const token = authHeader.replace("Bearer ", "");
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || !verifyToken(token, jwtSecret)) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      note: "Messages are sent directly to your Discord DM. This endpoint shows banned IPs only.",
      banned_ips: (process.env.BANNED_IPS || "").split(",").map((b) => b.trim()).filter(Boolean),
    }),
  };
};
