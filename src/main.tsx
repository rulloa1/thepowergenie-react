import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PowerGenieAssistant from './components/assistant/PowerGenieAssistant'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PowerGenieAssistant />
  </React.StrictMode>,
)
