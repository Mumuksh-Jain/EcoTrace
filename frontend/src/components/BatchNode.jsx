import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import { confidenceToGrade, gradeColor, stateColor, shortId, shortHash } from '../utils/layout'

function BatchNode({ data, selected }) {
  const grade = confidenceToGrade(data.confidence_score)

  return (
    <div className={`flow-node state-${data.state}${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--green-400)', border: 'none', width: 8, height: 8 }} />

      <div className="flow-node-title">{data.owner_role}</div>
      <div className="flow-node-id">{shortId(data.id)}</div>

      <div className="flow-node-meta">
        <span>{parseFloat(data.weight_kg).toFixed(1)} kg</span>
        <span className={`badge ${stateColor(data.state)}`}>{data.state}</span>
        <span className={`badge ${gradeColor(grade)}`}>Grade {grade}</span>
      </div>

      <div style={{ marginTop: '0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        {data.owner_name}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--green-400)', border: 'none', width: 8, height: 8 }} />
    </div>
  )
}

export default memo(BatchNode)
