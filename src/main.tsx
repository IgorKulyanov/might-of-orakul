import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AdminHashGate } from './components/AdminHashGate.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import {
  installActionLogGlobals,
  installGlobalErrorHooks,
} from './game/actionLog'

installActionLogGlobals()
installGlobalErrorHooks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <App />
    <AdminHashGate />
    </ErrorBoundary>
  </StrictMode>,
)
