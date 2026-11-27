import { defineConfig, type Connect } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/** /watch → /watch/ so the talk player's relative URLs resolve (dev and preview servers). */
const watchSlash: Connect.NextHandleFunction = (req, res, next) => {
  if (req.url === '/watch' || req.url?.startsWith('/watch?') || req.url?.startsWith('/watch#')) {
    res.statusCode = 301
    res.setHeader('Location', req.url.replace('/watch', '/watch/'))
    res.end()
    return
  }
  next()
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'watch-trailing-slash',
      configureServer: (server) => void server.middlewares.use(watchSlash),
      configurePreviewServer: (server) => void server.middlewares.use(watchSlash),
    },
  ],
  base: './',
  server: { port: 5199, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), watch: resolve(__dirname, 'watch/index.html') } },
  },
})
