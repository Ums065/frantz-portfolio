import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { LanguageProvider, FloatingLanguageToggle } from './lib/i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
      <FloatingLanguageToggle />
    </LanguageProvider>
  </StrictMode>,
)
