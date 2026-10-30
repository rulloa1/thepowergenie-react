import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const CUSTOMER_DATA_NEEDLES = [
  'Ferrell',
  'Hanna Ward',
  'Hannah Ward',
  '206732844',
  'AN14864224',
  '23929051',
  'cust_patricia',
  'patricia-ferrell',
]

function denyPrivateAssets() {
  return {
    name: 'deny-private-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let path = req.url || ''
        try {
          path = decodeURIComponent(path)
        } catch {
          /* Keep the raw URL when it is not valid encoding. */
        }
        if (path.toLowerCase().includes('private-assets')) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }
        next()
      })
    },
  }
}

function rejectCustomerDataInBundle(): Plugin {
  return {
    name: 'reject-customer-data-in-bundle',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        const file = item as { fileName: string; type: string; code?: string; source?: string | Uint8Array }
        const name = (file.fileName || '').toLowerCase()
        const source = file.type === 'chunk'
          ? (file.code || '')
          : typeof file.source === 'string'
            ? file.source
            : ''
        for (const needle of CUSTOMER_DATA_NEEDLES) {
          if (name.includes(needle.toLowerCase()) || source.includes(needle)) {
            this.error(`Production bundle ${file.fileName} contains customer data (${needle}).`)
          }
        }
      }
    },
  }
}

function powerGenieApi() {
  return {
    name: 'powergenie-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const route = new URL(req.url || '/', 'http://127.0.0.1').searchParams.get('route') || ''
        const assistant =
          (path === '/api/assistant' && /^(chat|uploads|bill|lead|slots|hub-bill|visit|invite|workflow|proposal)$/.test(route)) ||
          /^\/api\/(chat|uploads|bill|lead|slots|hub-bill|visit|invite)$/.test(path) ||
          path.startsWith('/api/tesla')
        if (!assistant) return next()
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
  publicDir: 'public',
  plugins: [
    denyPrivateAssets(),
    rejectCustomerDataInBundle(),
    react(),
    tailwindcss(),
    powerGenieApi(),
  ],
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/private-assets/**'],
    },
  },
})
