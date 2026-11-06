import { Redis } from "@upstash/redis";

// Supports both plain Upstash env vars and Vercel KV (Upstash-powered) env vars.
export function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Only allow ids shaped like our slugs, to keep keys safe.
export function validId(id) {
  return typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(id);
}
export function validDev(d) {
  return typeof d === "string" && /^[a-z0-9-]{1,60}$/.test(d);
}

// Allowed reaction keys (must match the frontend REACTIONS set).
export const REACTIONS = ["love", "thumb", "clap", "fire", "idea"];
