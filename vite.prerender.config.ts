import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Build-only renderer: reuses the real landing component without starting a Worker or accepting credentials. */
export default defineConfig({
  publicDir: false,
  plugins: [react()],
  build: {
    ssr: 'src/client/prerender.tsx',
    outDir: 'dist/prerender',
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: 'entry.mjs' } },
  },
})
