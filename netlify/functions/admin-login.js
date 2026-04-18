const crypto = require("crypto");

function signToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid" }) };
  }

  const { password } = body;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!adminPassword || !jwtSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: "config" }) };
  }

  const provided = crypto.createHash("sha256").update(password || "").digest("hex");
  const expected = crypto.createHash("sha256").update(adminPassword).digest("hex");

  if (provided !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  const token = signToken({ admin: true, exp: Math.floor(Date.now() / 1000) + 3600 }, jwtSecret);

  return {
    statusCode: 200,
    body: JSON.stringify({ token }),
  };
};
