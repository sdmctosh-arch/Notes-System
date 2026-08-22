import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './theme'
import './index.css'
import App from './App.jsx'

// autoUpdate (vite.config.js): a new build takes over on next load with no
// prompt UI - single-user internal tool, infrequent deploys, not worth a
// custom "new version available" toast for.
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
