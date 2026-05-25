import { useState, useCallback, useMemo } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, ReactFlowProvider,
} from 'reactflow'
import BatchNode from '../components/BatchNode'
import { api } from '../utils/api'
import { buildDagreLayout, confidenceToGrade, gradeColor, stateColor, shortHash } from '../utils/layout'

const nodeTypes = { batchNode: BatchNode }

// ── Grade legend ───────────────────────────────────────────────────────────
function GradeLegend() {
  return (
    <div style={{
      display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem',
      padding: '0.6rem 0.85rem', background: 'var(--bg-elevated)',
      borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)',
      alignItems: 'center',
    }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Purity grade:</span>
      <span className="badge badge-green">Grade A ≥80%</span>
      <span className="badge badge-amber">Grade B 60–79%</span>
      <span className="badge badge-red">Grade C &lt;60%</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
        Confidence = photo + GPS + entity trust + weight plausibility
      </span>
    </div>
  )
}

// ── Chain confidence summary ───────────────────────────────────────────────
function ChainConfidence({ nodes }) {
  if (!nodes || nodes.length === 0) return null

  const avg   = Math.round(nodes.reduce((s, n) => s + n.confidence_score, 0) / nodes.length)
  const min   = Math.min(...nodes.map(n => n.confidence_score))
  const grade = confidenceToGrade(avg)

  return (
    <div className="card" style={{ padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Chain Confidence
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: avg >= 80 ? 'var(--green-400)' : avg >= 60 ? 'var(--amber-400)' : 'var(--red-400)' }}>
          {avg}%
        </div>
        <span className={`badge ${gradeColor(grade)}`} style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem' }}>
          Grade {grade}
        </span>
      </div>
      <div className="conf-bar-track" style={{ marginBottom: '0.4rem' }}>
        <div className="conf-bar-fill" style={{ width: `${avg}%` }} />
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Weakest link: {min}%</span>
        <span>{nodes.length} batches in chain</span>
      </div>
    </div>
  )
}

// ── Inner DAG component ────────────────────────────────────────────────────
function TraceGraph({ lineageData, onNodeClick }) {
  const { flowNodes, flowEdges } = useMemo(
    () => buildDagreLayout(lineageData.nodes, lineageData.edges),
    [lineageData]
  )

  const [nodes, , onNodesChange] = useNodesState(flowNodes)
  const [edges, , onEdgesChange] = useEdgesState(flowEdges)

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onNodeClick(node.data)}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="rgba(255,255,255,0.03)" gap={24} />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={node => {
          if (node.data?.state === 'baled')     return '#60a5fa'
          if (node.data?.state === 'processed') return '#fbbf24'
          return '#4ade80'
        }}
        maskColor="rgba(10,15,13,0.7)"
      />
    </ReactFlow>
  )
}

// ── Node detail panel ──────────────────────────────────────────────────────
function NodeDetail({ node }) {
  if (!node) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>🔍</div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Click any node to inspect its details
        </p>
      </div>
    )
  }

  const grade = confidenceToGrade(node.confidence_score)
  const gradeDesc = grade === 'A'
    ? 'High quality — photo, GPS, trusted entity'
    : grade === 'B'
    ? 'Medium quality — partial data signals'
    : 'Low quality — missing photo, GPS or trust'

  return (
    <div className="card detail-panel">
      <div className="card-header">
        <h3 style={{ fontSize: '0.95rem' }}>Batch Details</h3>
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
          <span className={`badge ${stateColor(node.state)}`}>{node.state}</span>
          <span className={`badge ${gradeColor(grade)}`} style={{ fontSize: '0.8rem' }}>
            Grade {grade}
          </span>
        </div>
      </div>

      {/* Confidence badge — prominent ───────────── */}
      <div style={{
        background: grade === 'A' ? 'var(--green-dim)' : grade === 'B' ? 'var(--amber-dim)' : 'var(--red-dim)',
        border: `1px solid ${grade === 'A' ? 'var(--green-border)' : grade === 'B' ? 'rgba(251,191,36,0.3)' : 'rgba(248,113,113,0.3)'}`,
        borderRadius: 'var(--radius-md)', padding: '0.75rem',
        marginBottom: '0.75rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Purity Confidence
          </span>
          <span style={{
            fontSize: '1.25rem', fontWeight: 700,
            color: grade === 'A' ? 'var(--green-400)' : grade === 'B' ? 'var(--amber-400)' : 'var(--red-400)',
          }}>
            {node.confidence_score}%
          </span>
        </div>
        <div className="conf-bar-track" style={{ marginBottom: '0.35rem' }}>
          <div className="conf-bar-fill" style={{
            width: `${node.confidence_score}%`,
            background: grade === 'A'
              ? 'linear-gradient(90deg, var(--green-600), var(--green-400))'
              : grade === 'B'
              ? 'linear-gradient(90deg, #d97706, var(--amber-400))'
              : 'linear-gradient(90deg, #dc2626, var(--red-400))',
          }} />
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{gradeDesc}</div>
      </div>

      {[
        ['ID',       <span className="mono" style={{ fontSize: '0.7rem' }}>{node.id}</span>],
        ['Owner',    node.owner_name],
        ['Role',     node.owner_role],
        ['Material', node.material],
        ['Weight',   `${parseFloat(node.weight_kg).toFixed(2)} kg`],
        ['Hash',     <span className="hash-chip"><span className="mono">{shortHash(node.hash)}</span></span>],
        ['Created',  new Date(node.created_at).toLocaleString()],
      ].map(([key, val]) => (
        <div className="detail-row" key={key}>
          <span className="detail-key">{key}</span>
          <span className="detail-value">{val}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Trace page ────────────────────────────────────────────────────────
export default function TracePage() {
  const [input, setInput]       = useState('')
  const [lineage, setLineage]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)

  // Read ?id= from URL on mount
  useState(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    if (id) { setInput(id); fetchLineage(id) }
  })

  async function fetchLineage(id) {
    if (!id?.trim()) return
    setLoading(true); setError(null); setSelectedNode(null)
    try {
      const data = await api.getLineage(id.trim())
      setLineage(data)
      window.history.replaceState({}, '', `?id=${encodeURIComponent(id.trim())}`)
    } catch (e) {
      setError(e.message); setLineage(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit    = e => { e.preventDefault(); fetchLineage(input) }
  const handleNodeClick = useCallback(data => setSelectedNode(data), [])

  return (
    <div className="page">
      <div className="container">
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1>Provenance Trace</h1>
          <p style={{ marginTop: '0.4rem', maxWidth: '560px' }}>
            Enter any batch ID to visualise its complete lineage — bags, bale, and split portions — in one query.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSubmit} style={{ marginBottom: '1rem' }}>
          <div className="search-bar">
            <input id="trace-input" className="input"
              placeholder="Paste a batch ID (UUID)…"
              value={input} onChange={e => setInput(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }} />
            <button type="submit" id="trace-btn" className="btn btn-primary" disabled={loading}>
              {loading ? 'Loading…' : 'Trace'}
            </button>
          </div>
        </form>

        <GradeLegend />

        {error   && <div className="state-error"><span>⚠ {error}</span></div>}
        {loading && <div className="state-loading"><span>Loading lineage…</span></div>}

        {!lineage && !loading && !error && (
          <div className="state-empty" style={{ marginTop: '2rem' }}>
            <span style={{ fontSize: '2.5rem' }}>🔍</span>
            <span>Paste a batch ID from the Aggregator or Recycler page</span>
          </div>
        )}

        {lineage && !loading && (
          <>
            {/* Summary stats */}
            <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
              <div className="stat-card">
                <div className="stat-value">{lineage.summary.node_count}</div>
                <div className="stat-label">Batches in chain</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{lineage.summary.edge_count}</div>
                <div className="stat-label">Transformations</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{lineage.summary.source_nodes.length}</div>
                <div className="stat-label">Source batches</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ fontSize: '1rem' }}>
                  {lineage.summary.transforms.join(' + ') || '—'}
                </div>
                <div className="stat-label">Operations</div>
              </div>
            </div>

            <div className="trace-wrapper">
              {/* DAG */}
              <div className="dag-container">
                <ReactFlowProvider>
                  <TraceGraph lineageData={lineage} onNodeClick={handleNodeClick} />
                </ReactFlowProvider>
              </div>

              {/* Side panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <ChainConfidence nodes={lineage.nodes} />
                <NodeDetail node={selectedNode} />

                {selectedNode && (
                  <div className="card">
                    <h3 style={{ fontSize: '0.88rem', marginBottom: '0.6rem' }}>Hash Proof</h3>
                    <p style={{ fontSize: '0.75rem', marginBottom: '0.6rem', color: 'var(--text-muted)' }}>
                      SHA256 of canonical event payload. Any upstream change breaks this hash.
                    </p>
                    <div style={{
                      background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)',
                      padding: '0.6rem 0.75rem', wordBreak: 'break-all',
                      fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                      color: 'var(--green-400)', lineHeight: 1.7,
                    }}>
                      {selectedNode.hash}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
