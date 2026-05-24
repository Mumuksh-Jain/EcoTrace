import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'
import { enqueue, getQueueLength } from '../utils/offlineQueue'
import BatchCard from '../components/BatchCard'

const COLLECTORS = [
  { id: 'rag_01', name: 'Priya',  location: 'Ward 4' },
  { id: 'rag_02', name: 'Ajay',   location: 'Civil Lines' },
  { id: 'rag_03', name: 'Meena',  location: 'Sarabha Nagar' },
]

export default function CollectorPage() {
  const [collector, setCollector]   = useState(COLLECTORS[0])
  const [batches, setBatches]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [creating, setCreating]     = useState(false)
  const [transferring, setTransferring] = useState(null)
  const [form, setForm]             = useState({ weight_kg: '', material: 'PET' })
  const [result, setResult]         = useState(null)
  const [error, setError]           = useState(null)
  const [offline]                   = useState(!navigator.onLine)

  const loadBatches = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getBatches({ owner_id: collector.id })
      setBatches(data.batches || [])
    } catch { setBatches([]) }
    finally { setLoading(false) }
  }, [collector.id])

  useEffect(() => { loadBatches() }, [loadBatches])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true); setError(null); setResult(null)
    const body = {
      owner_id:   collector.id,
      material:   form.material,
      weight_kg:  parseFloat(form.weight_kg),
      photo_hash: 'photo_' + Date.now(),
      latitude:   30.902, longitude: 75.858,
    }
    try {
      if (!navigator.onLine) throw new Error('offline')
      const data = await api.createBatch(body)
      setResult({ type: 'created', data })
      loadBatches()
    } catch (err) {
      if (!navigator.onLine || err.message === 'offline') {
        const BASE = import.meta.env.VITE_API_URL || '/api'
        enqueue('POST', `${BASE}/batches`, body)
        setResult({ type: 'queued', qLen: getQueueLength() })
      } else { setError(err.message) }
    } finally { setCreating(false) }
  }

  async function handleTransfer(batch) {
    setTransferring(batch.id)
    try {
      await api.transfer(batch.id, {
        to_id: 'kab_01', latitude: 30.905, longitude: 75.859,
      })
      setResult({ type: 'transferred', batchId: batch.id })
      loadBatches()
    } catch (err) { setError(err.message) }
    finally { setTransferring(null) }
  }

  return (
    <div className="page">
      <div className="container">
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🚶</span>
              <h1 style={{ fontSize: '1.75rem' }}>Collector</h1>
            </div>
            <p>Log waste batches. Transfer custody to aggregator Ramesh.</p>
            {offline && <div className="badge badge-amber" style={{ marginTop: '0.5rem', padding: '0.35rem 0.75rem' }}>📴 Offline — batches queued</div>}
          </div>
          <select className="select" style={{ width: 'auto', minWidth: 160 }}
            value={collector.id} onChange={e => setCollector(COLLECTORS.find(c => c.id === e.target.value))}>
            {COLLECTORS.map(c => <option key={c.id} value={c.id}>{c.name} ({c.location})</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Create form */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Log New Batch</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label className="label" htmlFor="col-material">Material</label>
                <select id="col-material" className="select" value={form.material} onChange={set('material')}>
                  <option value="PET">PET</option><option value="HDPE">HDPE</option>
                  <option value="LDPE">LDPE</option><option value="Mixed">Mixed</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="col-weight">Weight (kg)</label>
                <input id="col-weight" className="input" type="number" step="0.1" min="0.1" max="50"
                  placeholder="e.g. 12" value={form.weight_kg} onChange={set('weight_kg')} required />
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.7rem' }}>
                📍 GPS auto-captured · 📸 Photo attached
              </div>
              <button className="btn btn-primary" type="submit" disabled={creating || !form.weight_kg}>
                {creating ? 'Logging…' : offline ? '📥 Queue Batch (Offline)' : '+ Log Batch'}
              </button>
            </form>

            {result && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', background: result.type === 'queued' ? 'var(--amber-dim)' : 'var(--green-dim)' }}>
                {result.type === 'queued' && <p style={{ color: 'var(--amber-400)', fontSize: '0.82rem' }}>📥 Queued locally — will sync when online ({result.qLen} in queue)</p>}
                {result.type === 'created' && <p style={{ color: 'var(--green-400)', fontSize: '0.82rem' }}>✓ Batch {result.data?.batch?.id?.slice(0,8)}… created · Confidence {result.data?.batch?.confidence_score}%</p>}
                {result.type === 'transferred' && <p style={{ color: 'var(--green-400)', fontSize: '0.82rem' }}>✓ Transferred to Ramesh (kab_01)</p>}
              </div>
            )}
            {error && <p style={{ marginTop: '0.75rem', color: 'var(--red-400)', fontSize: '0.82rem' }}>{error}</p>}
          </div>

          {/* Batch list */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1rem' }}>My Batches ({batches.length})</h2>
              <button className="btn btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }} onClick={loadBatches}>↻ Refresh</button>
            </div>
            {loading && <div className="state-loading" style={{ padding: '2rem' }}><span /></div>}
            {!loading && batches.length === 0 && <div className="state-empty" style={{ padding: '2rem' }}>No batches yet</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {batches.filter(b => b.state === 'raw').map(b => (
                <BatchCard key={b.id} batch={b} actions={batch => (
                  <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                    disabled={transferring === batch.id}
                    onClick={() => handleTransfer(batch)}>
                    {transferring === batch.id ? '…' : '→ Transfer to Ramesh'}
                  </button>
                )} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
