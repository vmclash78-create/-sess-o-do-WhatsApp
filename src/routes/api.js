const express = require('express')
const fs = require('fs')
const { SESSION_PATH, API_KEY } = require('../config/env')
const { state } = require('../services/whatsapp')
const { getRateLimitState } = require('../services/rateLimiter')
const { enqueue, getQueueStatus } = require('../services/queue')

const router = express.Router()

// ─── Middleware de Autenticação Opcional ─────────────────────────────────────
function authMiddleware(req, res, next) {
  if (!API_KEY) return next()

  const key = req.headers['x-api-key']
  if (key !== API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  next()
}

// ─── Rotas Públicas (sem auth) ────────────────────────────────────────────────

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    status: state.connectionStatus,
    timestamp: new Date().toISOString()
  })
})

router.get('/qr', (req, res) => {
  res.json({ qr: state.qrCodeBase64, status: state.connectionStatus })
})

router.get('/status', (req, res) => {
  res.json({
    status: state.connectionStatus,
    phone: state.connectedPhone,
    name: state.connectedName,
    isWarmingUp: state.isNewSession,
    ...getRateLimitState()
  })
})

// ─── Rotas Protegidas (auth opcional via API_KEY) ────────────────────────────

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    if (state.sock) await state.sock.logout()
    res.json({ success: true, message: 'Logout realizado com sucesso.' })
  } catch (err) {
    if (fs.existsSync(SESSION_PATH)) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true })
    }
    res.json({ success: true, message: 'Sessão encerrada localmente (com erro na nuvem).' })
  }
})

/**
 * POST /send-message
 * Body: { number: "5511999999999", message: "Olá!" }
 * Resposta: 202 Accepted com o ID da mensagem na fila
 */
router.post('/send-message', authMiddleware, (req, res) => {
  if (!state.sock || state.connectionStatus !== 'connected') {
    return res.status(400).json({ success: false, error: 'WhatsApp não conectado' })
  }

  if (state.isNewSession) {
    return res.status(503).json({
      success: false,
      error: 'Sessão em warm-up, aguarde alguns segundos'
    })
  }

  const { number, message } = req.body
  if (!number || !message) {
    return res.status(400).json({
      success: false,
      error: 'Parâmetros "number" e "message" são obrigatórios'
    })
  }

  // Enfileira e responde imediatamente — o envio ocorre em background
  const id = enqueue(number, message)
  res.status(202).json({ success: true, queued: true, id })
})

/**
 * GET /queue/status
 * Retorna o estado atual da fila de mensagens
 */
router.get('/queue/status', authMiddleware, (req, res) => {
  res.json(getQueueStatus())
})

module.exports = router
