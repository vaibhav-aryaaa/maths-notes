import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import * as Sentry from '@sentry/react'
import App from './App.tsx'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
console.log("Sentry diagnostics:", {
  dsnLength: SENTRY_DSN ? SENTRY_DSN.length : 0,
  isProd: import.meta.env.PROD,
})
if (SENTRY_DSN && import.meta.env.PROD) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}

// Register service worker for PWA support
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
