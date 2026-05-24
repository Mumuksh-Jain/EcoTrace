import { useState, useEffect, useCallback } from 'react'
import { api } from '../utils/api'
import BatchCard from '../components/BatchCard'

const ENTITY_ID   = 'kab_01'
const ENTITY_NAME = 'Ramesh — Kabadiwala (Ludhiana)'

export default function AggregatorPage() {
  const [batches, setBatches]     = useState([])
  const [selected, setSelected]   = useState(new Set())
  const [loading, setLoading]     = useState(false)
  const [merging, setMerging]     = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const [mergeWeight, setMergeWeight] = useState('')

  const loadBatches = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getBatches({ owner_id: ENTITY_ID })
      setBatches(data.batches || [])
    } catch { setBatches([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadBatches() }, [loadBatches])

  const rawBatches  = batches.filter(b => b.state === 'raw')
  const baledBatches = batches.filter(b => b.state === 'baled')

  const toggleSelect = batch => {
    setSelected(s => {
      const next = new Set(s)
      next.has(batch.id) ? next.delete(batch.id) : next.add(batch.id)
      return next
    })
  }

  const selectedBatches    = rawBatches.filter(b => selected.has(b.id))
  const selectionTotalWeight = selectedBatches.reduce((sum, b) => sum + parseFloat(b.weight_kg), 0)
  const allSameMaterial    = selectedBatches.length > 0 && new Set(selectedBatches.map(b => b.material)).size === 1
  const selectedMaterial   = allSameMaterial ? selectedBatches[0].material : null

  async function handleMerge() {
    if (selected.size < 2) { setError('Select at least 2 batches to merge'); return }
    if (!allSameMaterial)  { setError('All selected batches must be same material'); return }
    const wKg = parseFloat(mergeWeight) || selectionTotalWeight
    setMerging(true); setError(null); setResult(null)
    try {
      const data = await api.merge({
        owner_id:        ENTITY_ID,
        parent_batch_ids: [...selected],
        weight_kg:       wKg,
        material:        selectedMaterial,
      })
      setResult(data)
      setSelected(new Set())
      setMergeWeight('')
      loadBatches()
    } catch (err) { setError(err.message) }
    finally { setMerging(false) }
  }

  async function handleTransferBale(bale) {
    try {
      await api.transfer(bale.id, { to_id: 'rec_01' })
      loadBatches()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="page">
      <div className="container">
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⚖️</span>
            <h1 style={{ fontSize: '1.75rem' }}>Aggregator</h1>
          </div>
          <p>{ENTITY_NAME} — select bags, set bale weight, create a provenance-preserving bale.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left — bag list */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem' }}>Incoming Bags ({rawBatches.length})</h2>
              <button className="btn btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }} onClick={loadBatches}>↻ Refresh</button>
            </div>

            {loading && <div className="state-loading"><span /></div>}

            {!loading && rawBatches.length === 0 && (
              <div className="state-empty">
                <span>📦 No raw bags available</span>
                <span style={{ fontSize: '0.8rem' }}>Collectors transfer bags here first</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {rawBatches.map(b => (
                <BatchCard key={b.id} batch={b}
                  selectable selected={selected.has(b.id)}
                  onSelect={toggleSelect} />
              ))}
            </div>

            {baledBatches.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Bales Ready ({baledBatches.length})</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {baledBatches.map(b => (
                    <BatchCard key={b.id} batch={b} actions={bale => (
                      <>
                        <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                          onClick={() => handleTransferBale(bale)}>→ Send to EcoPolymers</button>
                        <a href={`/trace?id=${bale.id}`} className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>🔍 Trace</a>
                      </>
                    )} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — merge panel */}
          <div style={{ position: 'sticky', top: '5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card" style={{ borderColor: selected.size >= 2 ? 'var(--green-border)' : undefined }}>
              <h3 style={{ marginBottom: '1rem' }}>Create Bale (MERGE)</h3>

              {selected.size === 0 && (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Select ≥ 2 bags from the list to merge into a bale.
                </p>
              )}

              {selected.size > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="stat-card">
                      <div className="stat-value">{selected.size}</div>
                      <div className="stat-label">Bags selected</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{selectionTotalWeight.toFixed(1)}</div>
                      <div className="stat-label">Total kg</div>
                    </div>
                  </div>

                  {!allSameMaterial && (
                    <div style={{ color: 'var(--amber-400)', fontSize: '0.8rem' }}>
                      ⚠ Mixed materials — select same material to merge
                    </div>
                  )}
                  {allSameMaterial && (
                    <div className="badge badge-muted" style={{ alignSelf: 'flex-start' }}>{selectedMaterial}</div>
                  )}

                  <div className="form-group">
                    <label className="label" htmlFor="merge-weight">Bale weight (kg)</label>
                    <input id="merge-weight" className="input" type="number" step="0.1"
                      placeholder={`max ${selectionTotalWeight.toFixed(1)}`}
                      value={mergeWeight}
                      onChange={e => setMergeWeight(e.target.value)} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Leave blank to use full sum. Processing loss allowed (±0.1 kg).
                    </span>
                  </div>

                  <button className="btn btn-primary" onClick={handleMerge}
                    disabled={merging || selected.size < 2 || !allSameMaterial}
                    style={{ width: '100%' }}>
                    {merging ? 'Merging…' : `🔀 Create Bale`}
                  </button>
                </div>
              )}

              {error && <p style={{ color: 'var(--red-400)', fontSize: '0.82rem', marginTop: '0.75rem' }}>{error}</p>}
            </div>

            {result && (
              <div className="card" style={{ borderColor: 'var(--green-border)' }}>
                <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>✅</div>
                <h3 style={{ color: 'var(--green-400)', marginBottom: '0.75rem', fontSize: '0.95rem' }}>Bale Created</h3>
                <div className="detail-row"><span className="detail-key">Bale ID</span>
                  <span className="detail-value mono" style={{ fontSize: '0.68rem' }}>{result.batch?.id}</span></div>
                <div className="detail-row"><span className="detail-key">Weight</span>
                  <span className="detail-value">{parseFloat(result.batch?.weight_kg || 0).toFixed(1)} kg</span></div>
                <div className="detail-row"><span className="detail-key">Parents merged</span>
                  <span className="detail-value">{result.merge_summary?.parent_count}</span></div>
                <div className="detail-row"><span className="detail-key">Confidence</span>
                  <span className="detail-value">{result.batch?.confidence_score}%</span></div>
                <a href={`/trace?id=${result.batch?.id}`} className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem', fontSize: '0.82rem' }}>
                  🔍 View Lineage DAG
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
