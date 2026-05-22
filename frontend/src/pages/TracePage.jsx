import { useState, useCallback, useMemo } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, ReactFlowProvider,
} from 'reactflow'
import BatchNode from '../components/BatchNode'
import { api } from '../utils/api'
import { buildDagreLayout, confidenceToGrade, gradeColor, stateColor, shortHash } from '../utils/layout'

const nodeTypes = { batchNode: BatchNode }

// ── Inner component (needs ReactFlowProvider context) ─────────────────────
function TraceGraph({ lineageData, onNodeClick, selectedNode }) {
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
      attributionPosition="bottom-right"
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

// ── Detail panel for selected node ────────────────────────────────────────
function NodeDetail({ node }) {
  if (!node) {
    return (
      <div className="card">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
          Click any node to inspect its details
        </p>
      </div>
    )
  }

  const grade = confidenceToGrade(node.confidence_score)

  return (
    <div className="card detail-panel">
      <div className="card-header">
        <h3 style={{ fontSize: '0.95rem' }}>Batch Details</h3>
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
          <span className={`badge ${stateColor(node.state)}`}>{node.state}</span>
          <span className={`badge ${gradeColor(grade)}`}>Grade {grade}</span>
        </div>
      </div>

      {[
        ['ID',         <span className="mono" style={{ fontSize: '0.72rem' }}>{node.id}</span>],
        ['Owner',      node.owner_name],
        ['Role',       node.owner_role],
        ['Material',   node.material],
        ['Weight',     `${parseFloat(node.weight_kg).toFixed(2)} kg`],
        ['Confidence', `${node.confidence_score} / 100`],
        ['Hash',       <span className="hash-chip"><span className="mono">{shortHash(node.hash)}</span></span>],
        ['Created',    new Date(node.created_at).toLocaleString()],
      ].map(([key, val]) => (
        <div className="detail-row" key={key}>
          <span className="detail-key">{key}</span>
          <span className="detail-value">{val}</span>
        </div>
      ))}

      <div style={{ marginTop: '0.5rem' }}>
        <div className="label">Confidence</div>
        <div className="conf-bar-track">
          <div className="conf-bar-fill" style={{ width: `${node.confidence_score}%` }} />
        </div>
      </div>
    </div>
  )
}

// ── Main Trace page ───────────────────────────────────────────────────────
export default function TracePage() {
  const [batchId, setBatchId]     = useState('')
  const [input, setInput]         = useState('')
  const [lineage, setLineage]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)

  // Read ?id= from URL on load
  useState(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    if (id) { setInput(id); fetchLineage(id) }
  })

  async function fetchLineage(id) {
    if (!id?.trim()) return
    setLoading(true)
    setError(null)
    setSelectedNode(null)
    try {
      const data = await api.getLineage(id.trim())
      setLineage(data)
      setBatchId(id.trim())
      // push to URL for shareability
      window.history.replaceState({}, '', `?id=${encodeURIComponent(id.trim())}`)
    } catch (e) {
      setError(e.message)
      setLineage(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = e => {
    e.preventDefault()
    fetchLineage(input)
  }

  const handleNodeClick = useCallback(data => setSelectedNode(data), [])

  return (
    <div className="page">
      <div className="container">
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1>Provenance Trace</h1>
          <p style={{ marginTop: '0.5rem', maxWidth: '560px' }}>
            Enter any batch ID to visualise its complete lineage — from household source through every merge and split to final recycler.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
          <div className="search-bar">
            <input
              id="trace-input"
              className="input"
              placeholder="Paste a batch ID (e.g. bale UUID)…"
              value={input}
              onChange={e => setInput(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Loading…' : 'Trace'}
            </button>
          </div>
        </form>

        {/* States */}
        {error && (
          <div className="state-error">
            <span>⚠ {error}</span>
          </div>
        )}

        {!lineage && !loading && !error && (
          <div className="state-empty">
            <span style={{ fontSize: '2rem' }}>🔍</span>
            <span>Enter a batch ID above to render its provenance DAG</span>
          </div>
        )}

        {loading && <div className="state-loading"><span>Loading lineage…</span></div>}

        {/* DAG + detail */}
        {lineage && !loading && (
          <>
            {/* Summary stats */}
            <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
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
                <div className="stat-label">Operations recorded</div>
              </div>
            </div>

            <div className="trace-wrapper">
              {/* DAG */}
              <div className="dag-container">
                <ReactFlowProvider>
                  <TraceGraph
                    lineageData={lineage}
                    onNodeClick={handleNodeClick}
                    selectedNode={selectedNode}
                  />
                </ReactFlowProvider>
              </div>

              {/* Side panel */}
              <div>
                <NodeDetail node={selectedNode} />

                {/* Hash proof */}
                {selectedNode && (
                  <div className="card" style={{ marginTop: '1rem' }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Hash Proof</h3>
                    <p style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                      SHA256 of canonical event payload. Tamper-evident — any upstream change breaks this hash.
                    </p>
                    <div style={{
                      background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)',
                      padding: '0.6rem 0.8rem', wordBreak: 'break-all',
                      fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--green-400)',
                      lineHeight: 1.7,
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
