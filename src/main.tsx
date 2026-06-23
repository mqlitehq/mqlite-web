import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { TimeFormatProvider } from './lib/time.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TimeFormatProvider>
      <App />
    </TimeFormatProvider>
  </StrictMode>,
)
