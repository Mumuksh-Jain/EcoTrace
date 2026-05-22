import dagre from '@dagrejs/dagre'

const NODE_WIDTH  = 200
const NODE_HEIGHT = 90

/**
 * Takes nodes + edges from /api/lineage/:id and returns
 * React Flow nodes + edges with dagre layout applied.
 */
export function buildDagreLayout(apiNodes, apiEdges, direction = 'TB') {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80, marginx: 20, marginy: 20 })

  apiNodes.forEach(node => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  })

  apiEdges.forEach(edge => {
    g.setEdge(edge.parent_id, edge.child_id)
  })

  dagre.layout(g)

  const flowNodes = apiNodes.map(node => {
    const pos = g.node(node.id)
    return {
      id:       node.id,
      type:     'batchNode',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data:     node,
    }
  })

  const flowEdges = apiEdges.map((edge, i) => ({
    id:             `e-${i}-${edge.parent_id}-${edge.child_id}`,
    source:         edge.parent_id,
    target:         edge.child_id,
    label:          edge.transform,
    type:           'smoothstep',
    animated:       edge.transform === 'MERGE',
    labelStyle:     { fill: edge.transform === 'MERGE' ? '#60a5fa' : '#fbbf24', fontWeight: 600, fontSize: 11 },
    labelBgStyle:   { fill: 'rgba(17,24,21,0.9)', rx: 4, ry: 4 },
    labelBgPadding: [4, 6],
    style:          {
      stroke:      edge.transform === 'MERGE' ? '#60a5fa' : '#fbbf24',
      strokeWidth: 2,
    },
  }))

  return { flowNodes, flowEdges }
}

export function confidenceToGrade(score) {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  return 'C'
}

export function gradeColor(grade) {
  return grade === 'A' ? 'badge-green' : grade === 'B' ? 'badge-amber' : 'badge-red'
}

export function stateColor(state) {
  if (state === 'baled')     return 'badge-blue'
  if (state === 'processed') return 'badge-amber'
  return 'badge-muted'
}

export function shortId(id) {
  return id ? id.slice(0, 8) + '…' : '—'
}

export function shortHash(hash) {
  return hash ? hash.slice(0, 14) + '…' : '—'
}
