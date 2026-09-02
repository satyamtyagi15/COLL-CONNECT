import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true
      },
      '/reports': {
        target: 'http://127.0.0.1:3001'
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001'
      }
    }
  }
})
