import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174, // Explicitly locked to your target operational port
    watch: {
      usePolling: true,
    }
  }
})
