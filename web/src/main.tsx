import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App.tsx'
import './index.css'
import { applyTheme, getStoredTheme } from './lib/theme.ts'

// Збережений варіант дизайну (лише dev), щоб не блимала стандартна тема.
if (import.meta.env.DEV) applyTheme(getStoredTheme())

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

// Sentry підвантажується окремим чанком і лише коли задано VITE_SENTRY_DSN.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  void import('@sentry/react').then((Sentry) =>
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      // Токен порталу лежить в адресі сторінки: не відправляємо його разом з помилкою.
      beforeSend(event) {
        const scrub = (s: string) => s.replace(/(\/p\/)[^/?#\s]+/g, '$1[token]')
        if (event.request?.url) event.request.url = scrub(event.request.url)
        if (event.transaction) event.transaction = scrub(event.transaction)
        return event
      },
    }),
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
