import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The backend serves these paths directly in production (PROJECT.md 10.2 -
// FastAPI serves the built frontend). In dev, Vite and uvicorn run on
// separate ports, so proxy /items to the real backend instead of dealing
// with CORS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
