const express = require('express')
const cors = require('cors')
const { PORT, ALLOWED_ORIGIN } = require('./config/env')
const { startBot, state } = require('./services/whatsapp')
const apiRoutes = require('./routes/api')

const app = express()

app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}))

app.use(express.json())
app.use('/', apiRoutes)

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 BACKEND OPPSFLOW RODANDO EM: http://localhost:${PORT}`)
  startBot().catch(err => console.error('Erro Crítico:', err))
})

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n⚠️  Sinal ${signal} recebido. Encerrando servidor com segurança...`)

  // 1. Para de aceitar novas requisições HTTP
  server.close(() => {
    console.log('✅ Servidor HTTP encerrado.')
  })

  // 2. Encerra a conexão com o WhatsApp de forma limpa (salva creds.json)
  if (state.sock) {
    try {
      await state.sock.end()
      console.log('✅ Conexão WhatsApp encerrada com segurança.')
    } catch (err) {
      console.error('Aviso ao encerrar socket:', err.message)
    }
  }

  // 3. Força saída após 5s caso algo trave
  setTimeout(() => {
    console.log('⚠️  Timeout atingido — forçando saída.')
    process.exit(0)
  }, 5000).unref() // .unref() não impede o processo de terminar antes

  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))   // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')) // PM2 / Docker stop
