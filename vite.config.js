import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Nome do repositório no GitHub (necessário para o GitHub Pages)
  base: '/deteccao-fadiga/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
