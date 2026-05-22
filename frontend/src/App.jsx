import TracePage from './pages/TracePage'

function Navbar() {
  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <a href="/" className="navbar-brand" id="navbar-brand">
          🌿 EcoTrace<span> — Material Provenance</span>
        </a>
        <span className="navbar-tagline">"Every other system tracks items. EcoTrace tracks flows."</span>
      </div>
    </nav>
  )
}

export default function App() {
  // Simple path-based routing — no router library needed for Day 4
  const path = window.location.pathname

  return (
    <>
      <Navbar />
      {path === '/trace' || path === '/' || path === '' ? (
        <TracePage />
      ) : (
        <div className="page">
          <div className="container state-empty">
            <span style={{ fontSize: '2rem' }}>404</span>
            <span>Page not found</span>
            <a href="/" className="btn btn-ghost">Go to Trace</a>
          </div>
        </div>
      )}
    </>
  )
}
