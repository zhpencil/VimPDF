import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: vimpdf:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "media-src 'self' blob: data:"
].join('; ')

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'vimpdf-csp',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(
          '<!-- CSP -->',
          `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
        )
      }
    }
  ],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    target: 'chrome140',
    chunkSizeWarningLimit: 2000
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
