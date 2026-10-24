import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PowerGenieAssistant from './components/assistant/PowerGenieAssistant'
import LegalFooter from './components/LegalFooter'
import { legacyNodeRedirect, normalizePath, showMarketingAssistant, showRouterLegalFooter, sitePage } from './lib/siteRoutes'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import './index.css'

// Referral Hub (Supabase Edge Functions) is the public /book and /dashboard.
// Old /node/book and /node/dashboard URLs redirect here; they are not separate pages.
const HubBooking = lazy(() => import('./hub/BookingPage'))
const HubDashboard = lazy(() => import('./hub/Dashboard'))
const HomeownerPortal = lazy(() => import('./pages/HomeownerPortalPage'))

const path = normalizePath(window.location.pathname)
const legacyTarget = legacyNodeRedirect(path)

if (legacyTarget) {
  window.location.replace(legacyTarget + window.location.search + window.location.hash)
} else {
  const page =
    sitePage(path) === 'privacy' ? <PrivacyPage /> :
    sitePage(path) === 'terms' ? <TermsPage /> :
    sitePage(path) === 'book' ? <HubBooking /> :
    sitePage(path) === 'dashboard' ? <HubDashboard /> :
    sitePage(path) === 'homeowner' ? <HomeownerPortal /> :
    <App />

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Suspense fallback={null}>{page}</Suspense>
      {showRouterLegalFooter(path) ? <LegalFooter /> : null}
      {showMarketingAssistant(sitePage(path)) ? <PowerGenieAssistant /> : null}
    </React.StrictMode>,
  )
}
