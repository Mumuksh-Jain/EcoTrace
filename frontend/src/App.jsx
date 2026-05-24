import { useState, useEffect } from 'react'
import OfflineBanner   from './components/OfflineBanner'
import TracePage       from './pages/TracePage'
import HouseholdPage   from './pages/HouseholdPage'
import CollectorPage   from './pages/CollectorPage'
import AggregatorPage  from './pages/AggregatorPage'
import RecyclerPage    from './pages/RecyclerPage'

// ── Register PWA service worker ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

const ROUTES = [
  { path: '/',           label: null },   // redirect to /trace
  { path: '/trace',      label: '🔍 Trace' },
  { path: '/household',  label: '🏠 Household' },
  { path: '/collector',  label: '🚶 Collector' },
  { path: '/aggregator', label: '⚖️ Aggregator' },
  { path: '/recycler',   label: '🏭 Recycler' },
]

function Navbar({ current }) {
  const navLinks = ROUTES.filter(r => r.label)
  return (
    <nav className="navbar" id="main-nav">
      <div className="container navbar-inner">
        <a href="/trace" className="navbar-brand" id="navbar-brand">
          🌿 EcoTrace
        </a>
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {navLinks.map(r => (
            <a
              key={r.path}
              href={r.path}
              id={`nav-link-${r.path.slice(1)}`}
              style={{
                padding: '0.35rem 0.7rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.82rem',
                fontWeight: current === r.path ? 600 : 400,
                color: current === r.path ? 'var(--green-400)' : 'var(--text-secondary)',
                background: current === r.path ? 'var(--green-dim)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 200ms',
                whiteSpace: 'nowrap',
              }}
            >
              {r.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    // redirect / → /trace
    if (window.location.pathname === '/') {
      window.history.replaceState({}, '', '/trace')
      setPath('/trace')
    }
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function Page() {
    switch (path) {
      case '/household':  return <HouseholdPage />
      case '/collector':  return <CollectorPage />
      case '/aggregator': return <AggregatorPage />
      case '/recycler':   return <RecyclerPage />
      case '/trace':
      default:            return <TracePage />
    }
  }

  return (
    <>
      <Navbar current={path} />
      <OfflineBanner />
      <Page />
    </>
  )
}
