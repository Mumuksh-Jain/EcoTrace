/**
 * Offline Request Queue — PRD §9.2
 * Strategy: localStorage write + flush on reconnect.
 * No bidirectional sync engine — write-only queue.
 */

const QUEUE_KEY = 'ecotrace_offline_queue';

export function enqueue(method, url, body) {
  const queue = getQueue();
  queue.push({ method, url, body, queuedAt: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

export function getQueueLength() {
  return getQueue().length;
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

/**
 * Flush queued requests in order when back online.
 * @param {Function} onProgress (flushed, total) => void
 * @returns {{ flushed, failed, errors }}
 */
export async function flushQueue(onProgress) {
  const queue   = getQueue();
  const results = { flushed: 0, failed: 0, errors: [] };
  const remaining = [];

  for (let i = 0; i < queue.length; i++) {
    const req = queue[i];
    try {
      const res = await fetch(req.url, {
        method:  req.method,
        headers: { 'Content-Type': 'application/json' },
        body:    req.body ? JSON.stringify(req.body) : undefined,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      results.flushed++;
    } catch (e) {
      results.failed++;
      results.errors.push(e.message);
      remaining.push(req);  // keep failed items
    }
    onProgress?.(results.flushed, queue.length);
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return results;
}
