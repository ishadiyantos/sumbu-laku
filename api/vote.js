import { getRedis, validId, validDev } from "./_redis.js";

// POST /api/vote  body: { id, deviceId, action: "love" | "unlove" }
// -> { id, count, mine }
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const redis = getRedis();
  if (!redis) return res.status(503).json({ error: "backend not configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const { id, deviceId, action } = body;

  if (!validId(id) || !validDev(deviceId) || (action !== "love" && action !== "unlove")) {
    return res.status(400).json({ error: "bad request" });
  }

  try {
    const key = `sb:love:${id}`;
    if (action === "love") {
      await redis.sadd(key, deviceId);
      await redis.sadd("sb:works", id);
    } else {
      await redis.srem(key, deviceId);
    }
    const count = await redis.scard(key);
    const mine = action === "love";
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ id, count: Number(count) || 0, mine });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
}
