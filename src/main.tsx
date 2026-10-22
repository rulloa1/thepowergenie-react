import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PowerGenieAssistant from './components/assistant/PowerGenieAssistant'
import './index.css'

// Referral Hub (Supabase Edge Functions) is the public /book and /dashboard.
// The earlier Vercel-function pages stay available at /node/book and /node/dashboard.
const HubBooking = lazy(() => import('./hub/BookingPage'))
const HubDashboard = lazy(() => import('./hub/Dashboard'))
const NodeBooking = lazy(() => import('./pages/BookPage'))
const NodeDashboard = lazy(() => import('./pages/DashboardPage'))

const path = window.location.pathname.replace(/\/+$/, '') || '/'
const page =
  path === '/book' ? <HubBooking /> :
  path === '/dashboard' ? <HubDashboard /> :
  path === '/node/book' ? <NodeBooking /> :
  path === '/node/dashboard' ? <NodeDashboard /> :
  <App />
const marketing = path !== '/book' && path !== '/dashboard' && path !== '/node/book' && path !== '/node/dashboard'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>{page}</Suspense>
    {marketing ? <PowerGenieAssistant /> : null}
  </React.StrictMode>,
)
