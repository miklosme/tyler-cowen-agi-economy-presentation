import { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'

// No StrictMode, for the same reason as the deck (drei <Html> + React 19 double effects).
const Talk = lazy(() => import('./Talk'))

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={null}>
    <Talk />
  </Suspense>,
)
