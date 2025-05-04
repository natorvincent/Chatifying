import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import toml from 'toml'
import fs from 'fs'

// Try to load secrets, fallback to environment variables if file doesn't exist
let secrets = { GEMINI_API_KEY: process.env.GEMINI_API_KEY || '' }
try {
  if (fs.existsSync('./secrets.toml')) {
    secrets = toml.parse(fs.readFileSync('./secrets.toml', 'utf-8'))
  }
} catch (error) {
  console.warn('Could not load secrets.toml, using environment variables instead')
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
   'import.meta.env.GEMINI_API_KEY': JSON.stringify(secrets.GEMINI_API_KEY || ''),
   global: 'window',
  },
  optimizeDeps: {
    include: ['sockjs-client'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'http://localhost:8080',
        ws: true,
      }
    },
  },
})