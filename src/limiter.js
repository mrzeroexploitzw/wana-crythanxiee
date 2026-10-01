const buckets = new Map();

export function allow(key, limit, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const b = buckets.get(key) || [];
  const fresh = b.filter(t => now - t < windowMs);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  buckets.set(key, fresh);
  return true;
}

const duplicate = new Map();
export function isDuplicate(key, ttlMs = 10 * 60 * 1000) {
  const now = Date.now();
  const previous = duplicate.get(key);
  duplicate.set(key, now);
  return previous && now - previous < ttlMs;
}

const flood = new Map();
export function floodCount(key, windowMs = 5000) {
  const now = Date.now();
  const list = (flood.get(key) || []).filter(t => now - t < windowMs);
  list.push(now);
  flood.set(key, list);
  return list.length;
}
