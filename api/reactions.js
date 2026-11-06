import { getRedis } from "./_redis.js";

// GET /api/reactions?deviceId=...
// -> { counts: { id: { emoji: n } }, mine: { id: [emoji, ...] } }
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }
  const redis = getRedis();
  if (!redis) return res.status(503).json({ error: "backend not configured" });

  const deviceId = (req.query && req.query.deviceId) || "";
  try {
    const ids = await redis.smembers("sb:works");
    const counts = {};
    const mine = {};
    if (ids && ids.length) {
      const p = redis.pipeline();
      ids.forEach((id) => p.hgetall(`sb:rc:${id}`));
      if (deviceId) ids.forEach((id) => p.smembers(`sb:rd:${id}:${deviceId}`));
      const r = await p.exec();
      ids.forEach((id, i) => {
        const h = r[i] || {};
        const c = {};
        for (const k in h) { const n = Number(h[k]) || 0; if (n > 0) c[k] = n; }
        counts[id] = c;
      });
      if (deviceId) {
        ids.forEach((id, i) => {
          const arr = r[ids.length + i];
          mine[id] = Array.isArray(arr) ? arr : [];
        });
      }
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ counts, mine });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
}
