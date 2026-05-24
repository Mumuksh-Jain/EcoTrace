import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'
import BatchCard from '../components/BatchCard'

const ENTITY_ID   = 'rec_01'
const ENTITY_NAME = 'EcoPolymers Ltd — Ludhiana Recycling Unit'

export default function RecyclerPage() {
  const [batches, setBatches]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [splitting, setSplitting] = useState(null)
  const [splitForm, setSplitForm] = useState({ w1: '', w2: '' })
  const [error, setError]         = useState(null)
  const [result, setResult]       = useState(null)
  const [activeSplit, setActiveSplit] = useState(null)

  const loadBatches = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getBatches({ owner_id: ENTITY_ID })
      setBatches(data.batches || [])
    } catch { setBatches([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadBatches() }, [loadBatches])

  const bales     = batches.filter(b => b.state === 'baled')
  const processed = batches.filter(b => b.state === 'processed')

  async function handleSplit(bale) {
    const w1 = parseFloat(splitForm.w1)
    const w2 = parseFloat(splitForm.w2)
    if (!w1 || !w2)         { setError('Enter weights for both portions'); return }
    if (w1 + w2 > parseFloat(bale.weight_kg) + 0.1) { setError('Children exceed parent weight'); return }
    setSplitting(bale.id); setError(null); setResult(null)
    try {
      const data = await api.split(bale.id, {
        owner_id: ENTITY_ID,
        children: [
          { weight_kg: w1, to_id: ENTITY_ID },
          { weight_kg: w2, to_id: ENTITY_ID },
        ],
      })
      setResult(data)
      setActiveSplit(null)
      setSplitForm({ w1: '', w2: '' })
      loadBatches()
    } catch (err) { setError(err.message) }
    finally { setSplitting(null) }
  }

  return (
    <div className="page">
      <div className="container">
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🏭</span>
            <h1 style={{ fontSize: '1.75rem' }}>Recycler</h1>
          </div>
          <p>{ENTITY_NAME} — receive bales, split into pellet grades, view full provenance before pricing.</p>
        </div>

        {/* Incoming bales */}
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Bales Ready to Process ({bales.length})</h2>

        {loading && <div className="state-loading"><span /></div>}

        {!loading && bales.length === 0 && (
          <div className="state-empty">
            <span>📦</span>
            <span>No bales available yet — aggregator must transfer bales here first</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          {bales.map(bale => (
            <div key={bale.id}>
              <BatchCard batch={bale} actions={b => (
                <>
                  <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                    onClick={() => { setActiveSplit(activeSplit === b.id ? null : b.id); setError(null); setResult(null) }}>
                    ✂ Split
                  </button>
                  <a href={`/trace?id=${b.id}`} className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>
                    🔍 View Provenance
                  </a>
                </>
              )} />

              {activeSplit === bale.id && (
                <div className="card" style={{ marginTop: '0.5rem', borderColor: 'rgba(251,191,36,0.3)' }}>
                  <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                    Split {parseFloat(bale.weight_kg).toFixed(1)} kg bale
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    Processing loss is allowed (children must not exceed parent weight).
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div className="form-group">
                      <label className="label" htmlFor={`split-w1-${bale.id}`}>Portion A (kg)</label>
                      <input id={`split-w1-${bale.id}`} className="input" type="number" step="0.1" min="0.1"
                        placeholder="e.g. 20" value={splitForm.w1}
                        onChange={e => setSplitForm(f => ({ ...f, w1: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="label" htmlFor={`split-w2-${bale.id}`}>Portion B (kg)</label>
                      <input id={`split-w2-${bale.id}`} className="input" type="number" step="0.1" min="0.1"
                        placeholder="e.g. 14" value={splitForm.w2}
                        onChange={e => setSplitForm(f => ({ ...f, w2: e.target.value }))} />
                    </div>
                  </div>
                  {splitForm.w1 && splitForm.w2 && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      Processing loss: {Math.max(0, parseFloat(bale.weight_kg) - parseFloat(splitForm.w1 || 0) - parseFloat(splitForm.w2 || 0)).toFixed(2)} kg
                      · Recovery: {(((parseFloat(splitForm.w1 || 0) + parseFloat(splitForm.w2 || 0)) / parseFloat(bale.weight_kg)) * 100).toFixed(1)}%
                    </div>
                  )}
                  {error && <p style={{ color: 'var(--red-400)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>{error}</p>}
                  <button className="btn btn-primary" style={{ width: '100%' }}
                    disabled={splitting === bale.id || !splitForm.w1 || !splitForm.w2}
                    onClick={() => handleSplit(bale)}>
                    {splitting === bale.id ? 'Splitting…' : '✂ Confirm Split'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {result && (
          <div className="card" style={{ borderColor: 'var(--green-border)', marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--green-400)', marginBottom: '0.75rem' }}>✅ Split Complete</h3>
            <div className="detail-row"><span className="detail-key">Parent weight</span>
              <span className="detail-value">{parseFloat(result.split_summary?.parent_weight || 0).toFixed(1)} kg</span></div>
            <div className="detail-row"><span className="detail-key">Portions created</span>
              <span className="detail-value">{result.split_summary?.child_count}</span></div>
            <div className="detail-row"><span className="detail-key">Processing loss</span>
              <span className="detail-value">{parseFloat(result.split_summary?.processing_loss || 0).toFixed(2)} kg</span></div>
            <div className="detail-row"><span className="detail-key">Recovery rate</span>
              <span className="detail-value">{result.split_summary?.recovery_rate}%</span></div>
            {result.children?.map((c, i) => (
              <div key={c.id} style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span className="badge badge-green">Portion {String.fromCharCode(65 + i)}</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{c.weight_kg} kg</span>
                <a href={`/trace?id=${c.id}`} className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', marginLeft: 'auto' }}>🔍 Trace</a>
              </div>
            ))}
          </div>
        )}

        {/* Processed portions */}
        {processed.length > 0 && (
          <>
            <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Processed Portions ({processed.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {processed.map(b => (
                <BatchCard key={b.id} batch={b} actions={batch => (
                  <a href={`/trace?id=${batch.id}`} className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>
                    🔍 Full Provenance
                  </a>
                )} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
