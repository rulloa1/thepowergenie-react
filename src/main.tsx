import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PowerGenieAssistant from './components/assistant/PowerGenieAssistant'
import './index.css'

// Referral Hub (Supabase Edge Functions) is the public /book and /dashboard.
const HubBooking = lazy(() => import('./hub/BookingPage'))
const HubDashboard = lazy(() => import('./hub/Dashboard'))

const path = window.location.pathname.replace(/\/+$/, '') || '/'
const legacyTarget =
  path === '/node/book' ? '/book' :
  path === '/node/dashboard' ? '/dashboard' :
  null

if (legacyTarget) {
  window.location.replace(legacyTarget + window.location.search + window.location.hash)
} else {
  const page =
    path === '/book' ? <HubBooking /> :
    path === '/dashboard' ? <HubDashboard /> :
    <App />
  const marketing = path !== '/book' && path !== '/dashboard'

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Suspense fallback={null}>{page}</Suspense>
      {marketing ? <PowerGenieAssistant /> : null}
    </React.StrictMode>,
  )
}
