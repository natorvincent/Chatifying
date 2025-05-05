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

// Hardcode the backend URL for now to ensure consistency
const backendUrl = process.env.NODE_ENV === 'production'
  ? 'https://chatifying.onrender.com'
  : 'http://localhost:8080';

console.log(`Using backend URL: ${backendUrl}`);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.GEMINI_API_KEY': JSON.stringify(secrets.GEMINI_API_KEY || ''),
    'import.meta.env.BACKEND_URL': JSON.stringify(backendUrl),
    global: 'window',
  },
  optimizeDeps: {
    include: ['sockjs-client'],
  },
  server: {
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: backendUrl,
        ws: true,
        changeOrigin: true,
      }
    },
  },
})