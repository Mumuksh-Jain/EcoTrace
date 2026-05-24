import { useState } from 'react'
import { api } from '../utils/api'
import { enqueue, getQueueLength } from '../utils/offlineQueue'

const ENTITY_ID = 'house_01'

export default function HouseholdPage() {
  const [form, setForm]       = useState({ weight_kg: '', material: 'PET' })
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)
  const [offline, setOffline] = useState(!navigator.onLine)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(null); setResult(null)
    const body = {
      owner_id:  ENTITY_ID,
      material:  form.material,
      weight_kg: parseFloat(form.weight_kg),
      photo_hash: 'simulated_photo_' + Date.now(),
      latitude:   30.9010,
      longitude:  75.8573,
    }
    try {
      if (!navigator.onLine) throw new Error('offline')
      const data = await api.createBatch(body)
      setResult(data)
    } catch (err) {
      if (!navigator.onLine || err.message === 'offline') {
        const BASE = import.meta.env.VITE_API_URL || '/api'
        enqueue('POST', `${BASE}/batches`, body)
        setOffline(true)
        setResult({ queued: true, queue_length: getQueueLength(), batch: { id: '(pending sync)', weight_kg: form.weight_kg, material: form.material } })
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🏠</span>
            <h1 style={{ fontSize: '1.75rem' }}>Household</h1>
          </div>
          <p>Sharma Household — Ward 4, Ludhiana. Log waste at the kerb. QR sticker printed for the bin.</p>
          {offline && (
            <div className="badge badge-amber" style={{ marginTop: '0.75rem', padding: '0.35rem 0.75rem' }}>
              📴 Offline mode — batches queued locally
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1.25rem' }}>Log Waste Batch</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="label" htmlFor="hw-material">Material</label>
              <select id="hw-material" className="select" value={form.material} onChange={set('material')}>
                <option value="PET">PET Plastic</option>
                <option value="HDPE">HDPE Plastic</option>
                <option value="LDPE">LDPE Plastic</option>
                <option value="Mixed">Mixed Plastic</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label" htmlFor="hw-weight">Weight (kg)</label>
              <input id="hw-weight" className="input" type="number" step="0.1" min="0.1" max="50"
                placeholder="e.g. 2.0" value={form.weight_kg} onChange={set('weight_kg')} required />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.75rem' }}>
              <span>📸 Photo captured (simulated)</span>
              <span style={{ marginLeft: 'auto' }}>📍 GPS: 30.9010, 75.8573</span>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || !form.weight_kg} style={{ width: '100%' }}>
              {loading ? 'Creating…' : '🏷 Generate QR Batch'}
            </button>
          </form>
        </div>

        {error && <div className="state-error" style={{ marginTop: '1rem' }}>{error}</div>}

        {result && (
          <div className="card" style={{ marginTop: '1.25rem', borderColor: result.queued ? 'rgba(251,191,36,0.4)' : 'var(--green-border)' }}>
            {result.queued ? (
              <>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📥</div>
                <h3 style={{ color: 'var(--amber-400)', marginBottom: '0.5rem' }}>Saved to Offline Queue</h3>
                <p style={{ fontSize: '0.85rem' }}>Batch will sync when connection is restored. Queue: <strong>{result.queue_length}</strong> item(s).</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✅</div>
                <h3 style={{ color: 'var(--green-400)', marginBottom: '0.75rem' }}>Batch Created</h3>
                <div className="detail-row"><span className="detail-key">Batch ID (QR data)</span>
                  <span className="detail-value mono" style={{ fontSize: '0.72rem' }}>{result.batch?.id}</span></div>
                <div className="detail-row"><span className="detail-key">Weight</span>
                  <span className="detail-value">{parseFloat(result.batch?.weight_kg).toFixed(1)} kg {result.batch?.material}</span></div>
                <div className="detail-row"><span className="detail-key">Confidence</span>
                  <span className="detail-value">{result.batch?.confidence_score}%</span></div>
                <div className="detail-row"><span className="detail-key">Hash</span>
                  <span className="detail-value mono" style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{result.batch?.hash}</span></div>
                <div style={{ marginTop: '1rem' }}>
                  <a href={`/trace?id=${result.batch?.id}`} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
                    🔍 View Lineage
                  </a>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
