import { useState, useEffect } from 'react'
import { getQueueLength, flushQueue } from '../utils/offlineQueue'

export default function OfflineBanner() {
  const [online, setOnline]   = useState(navigator.onLine)
  const [qLen, setQLen]       = useState(getQueueLength())
  const [flushing, setFlushing] = useState(false)
  const [result, setResult]   = useState(null)

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true)
      const len = getQueueLength()
      setQLen(len)
      if (len > 0) {
        setFlushing(true)
        const r = await flushQueue()
        setResult(r)
        setFlushing(false)
        setQLen(getQueueLength())
        setTimeout(() => setResult(null), 4000)
      }
    }
    const goOffline = () => { setOnline(false); setQLen(getQueueLength()) }

    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online && qLen === 0 && !result) return null

  if (!online) return (
    <div style={{
      background: 'var(--amber-dim)', borderBottom: '1px solid rgba(251,191,36,0.3)',
      padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center',
      gap: '0.5rem', fontSize: '0.82rem', color: 'var(--amber-400)',
    }}>
      <span>📴</span>
      <span><strong>Offline mode</strong> — requests saved to queue ({qLen} queued)</span>
    </div>
  )

  if (flushing) return (
    <div style={{
      background: 'var(--blue-dim)', borderBottom: '1px solid rgba(96,165,250,0.3)',
      padding: '0.5rem 1.5rem', fontSize: '0.82rem', color: 'var(--blue-400)',
    }}>
      ⟳ Back online — syncing {qLen} queued request{qLen !== 1 ? 's' : ''}…
    </div>
  )

  if (result) return (
    <div style={{
      background: 'var(--green-dim)', borderBottom: '1px solid var(--green-border)',
      padding: '0.5rem 1.5rem', fontSize: '0.82rem', color: 'var(--green-400)',
    }}>
      ✓ Synced {result.flushed} queued request{result.flushed !== 1 ? 's' : ''}
      {result.failed > 0 ? ` (${result.failed} failed)` : ''}
    </div>
  )

  return null
}
