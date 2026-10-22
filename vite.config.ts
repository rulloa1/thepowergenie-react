import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function powerGenieApi() {
  return {
    name: 'powergenie-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        if (!path.startsWith('/api/')) return next()
        try {
          const mod = await server.ssrLoadModule('/server/node-handler.ts')
          await mod.handleNodeRequest(req, res)
        } catch (error) {
          console.error('api_dev_error', error instanceof Error ? error.name : 'unknown')
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'Something went wrong. Please try again.' }))
          } else {
            res.end()
          }
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    powerGenieApi(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
})
