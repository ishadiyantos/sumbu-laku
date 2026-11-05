import { getRedis } from "./_redis.js";

// GET /api/votes?deviceId=...
// -> { counts: { id: n, ... }, mine: [id, ...] }
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }
  const redis = getRedis();
  if (!redis) {
    // Backend not configured yet -> tell client to use local fallback.
    return res.status(503).json({ error: "backend not configured" });
  }
  const deviceId = (req.query && req.query.deviceId) || "";
  try {
    const ids = await redis.smembers("sb:works");
    const counts = {};
    const mine = [];
    if (ids && ids.length) {
      const p = redis.pipeline();
      ids.forEach((id) => p.scard(`sb:love:${id}`));
      if (deviceId) ids.forEach((id) => p.sismember(`sb:love:${id}`, deviceId));
      const r = await p.exec();
      ids.forEach((id, i) => { counts[id] = Number(r[i]) || 0; });
      if (deviceId) {
        ids.forEach((id, i) => { if (r[ids.length + i]) mine.push(id); });
      }
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ counts, mine });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
}
