import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import App from './App'
import { queryClient } from '@dairydirect/shared/lib/queryClient'
import { TooltipProvider } from '@dairydirect/shared/ui/overlays'
// SW registration is deferred (async) so it never blocks first paint
import('virtual:pwa-register').then((m) => m.registerSW({ immediate: true })).catch(() => {})
// leaflet CSS is imported inside the on-demand map chunk (ui/map)
import '@dairydirect/shared/styles/index.css'

// Toasts load on demand — nothing about them blocks first paint.
const Toaster = lazy(() => import('sonner').then((m) => ({ default: m.Toaster })))

// Persist the query cache (reference data + lists) to localStorage so repeat
// visits paint instantly and revalidate in the background. Key is admin-scoped.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'dd_admin_query_cache_v1',
  throttleTime: 3000,
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, buster: 'dd-admin-v1' }}
    >
      <BrowserRouter>
        <TooltipProvider>
          <App />
          <Suspense fallback={null}>
            <Toaster position="top-right" richColors closeButton offset={18} toastOptions={{ style: { borderRadius: '14px', fontFamily: 'Poppins, sans-serif' } }} />
          </Suspense>
        </TooltipProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
)
