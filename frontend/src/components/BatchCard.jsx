import { confidenceToGrade, gradeColor, stateColor, shortHash } from '../utils/layout'

export default function BatchCard({ batch, selectable, selected, onSelect, actions }) {
  const grade = confidenceToGrade(batch.confidence_score)

  return (
    <div
      className="card"
      id={`batch-card-${batch.id}`}
      style={{
        cursor: selectable ? 'pointer' : 'default',
        border: selected
          ? '1.5px solid var(--green-400)'
          : '1px solid rgba(255,255,255,0.06)',
        background: selected ? 'var(--bg-overlay)' : 'var(--bg-surface)',
        transition: 'all 200ms',
        padding: '1rem',
      }}
      onClick={() => selectable && onSelect?.(batch)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
            <span className={`badge ${stateColor(batch.state)}`}>{batch.state}</span>
            <span className={`badge ${gradeColor(grade)}`}>Grade {grade}</span>
            <span className="badge badge-muted">{batch.material}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
            {batch.id}
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--green-400)' }}>
              {parseFloat(batch.weight_kg).toFixed(1)} kg
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {batch.owner_name || batch.current_owner_id}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Confidence</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: batch.confidence_score >= 80 ? 'var(--green-400)' : batch.confidence_score >= 60 ? 'var(--amber-400)' : 'var(--red-400)' }}>
            {batch.confidence_score}%
          </div>
        </div>

        {selectable && (
          <div style={{
            width: 20, height: 20, borderRadius: 4, border: '2px solid',
            borderColor: selected ? 'var(--green-400)' : 'rgba(255,255,255,0.2)',
            background: selected ? 'var(--green-500)' : 'transparent',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {selected && <span style={{ color: '#000', fontSize: 12 }}>✓</span>}
          </div>
        )}
      </div>

      <div style={{ marginTop: '0.6rem' }}>
        <div className="conf-bar-track">
          <div className="conf-bar-fill" style={{ width: `${batch.confidence_score}%` }} />
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="hash-chip">
          <span className="mono">{shortHash(batch.hash)}</span>
        </div>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {new Date(batch.created_at).toLocaleString()}
        </span>
      </div>

      {actions && (
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
          onClick={e => e.stopPropagation()}>
          {actions(batch)}
        </div>
      )}
    </div>
  )
}
