import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate from vite.config.js - tests don't need the Tailwind plugin
// (nothing under test imports index.css), and keeping it out avoids
// pulling the PostCSS pipeline into every test run.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
