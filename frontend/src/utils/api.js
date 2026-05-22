const BASE = import.meta.env.VITE_API_URL || '/api'

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

export const api = {
  getLineage:  (id)   => request(`/lineage/${id}`),
  getBatch:    (id)   => request(`/batches/${id}`),
  getBatches:  (q)    => request(`/batches?${new URLSearchParams(q)}`),
  getEntities: (q)    => request(`/entities?${new URLSearchParams(q || {})}`),
  getTransfers:(q)    => request(`/transfers?${new URLSearchParams(q || {})}`),
  createBatch: (body) => request('/batches', { method: 'POST', body: JSON.stringify(body) }),
  transfer:    (id, body) => request(`/batches/${id}/transfer`, { method: 'POST', body: JSON.stringify(body) }),
  merge:       (body) => request('/batches/merge', { method: 'POST', body: JSON.stringify(body) }),
  split:       (id, body) => request(`/batches/${id}/split`, { method: 'POST', body: JSON.stringify(body) }),
}
