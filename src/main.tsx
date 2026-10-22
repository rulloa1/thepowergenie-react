import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// The Referral Hub pages load on demand so the scroll site's bundle stays small.
const BookingPage = lazy(() => import('./hub/BookingPage'))
const Dashboard = lazy(() => import('./hub/Dashboard'))

const path = window.location.pathname.replace(/\/+$/, '') || '/'
const page =
  path === '/book' ? <BookingPage /> :
  path === '/dashboard' ? <Dashboard /> :
  <App />

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>{page}</Suspense>
  </React.StrictMode>,
)
