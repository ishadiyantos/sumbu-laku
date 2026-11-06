import { getRedis, validId, validDev, REACTIONS } from "./_redis.js";

// POST /api/react  body: { id, deviceId, emoji, action: "add" | "remove" }
// -> { id, emoji, count, mine }
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
  const { id, deviceId, emoji, action } = body;

  if (!validId(id) || !validDev(deviceId) || !REACTIONS.includes(emoji) ||
      (action !== "add" && action !== "remove")) {
    return res.status(400).json({ error: "bad request" });
  }

  try {
    const devKey = `sb:rd:${id}:${deviceId}`; // set of emoji keys this device used on this work
    const cntKey = `sb:rc:${id}`;             // hash emoji -> count
    let changed = 0;
    if (action === "add") {
      changed = await redis.sadd(devKey, emoji);
      if (changed) { await redis.hincrby(cntKey, emoji, 1); await redis.sadd("sb:works", id); }
    } else {
      changed = await redis.srem(devKey, emoji);
      if (changed) { await redis.hincrby(cntKey, emoji, -1); }
    }
    let count = Number(await redis.hget(cntKey, emoji)) || 0;
    if (count < 0) count = 0;
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ id, emoji, count, mine: action === "add" });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
}
