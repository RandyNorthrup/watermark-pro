import './lib/zod-config'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createQueryClient } from './lib/query-client'
import { applyTheme, readTheme, watchSystemTheme } from './lib/theme'
import { createAppRouter } from './router'
import '@fontsource-variable/inter'
import './styles/app.css'

const rootElement = document.querySelector('#root')
if (rootElement === null) {
  throw new Error('index.html must contain an element with id="root"')
}

applyTheme(readTheme())
watchSystemTheme()

const queryClient = createQueryClient()
const router = createAppRouter(queryClient)

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
