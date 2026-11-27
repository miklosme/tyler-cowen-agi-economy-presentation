import { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

// No StrictMode: its double-invoked layout effects make drei's <Html> create two React roots on
// one container in dev, and the deferred unmount of the first throws (removeChild NotFoundError),
// which takes down the whole R3F tree.
const params = new URLSearchParams(window.location.search)
const ModelPreview = lazy(() => import('./preview/ModelPreview'))
const Deck = lazy(() => import('./deck/Deck'))

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={null}>{params.has('model') ? <ModelPreview /> : <Deck />}</Suspense>,
)
