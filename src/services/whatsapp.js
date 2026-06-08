const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys')
const QRCode = require('qrcode')
const fs = require('fs')
const pino = require('pino')

const { SESSION_PATH } = require('../config/env')
const { humanDelay } = require('../utils/delay')
const { checkRateLimit } = require('./rateLimiter')
const { fireWebhook } = require('./webhook')

const state = {
  qrCodeBase64: null,
  sock: null,
  connectionStatus: 'disconnected',
  isNewSession: false,
  connectedPhone: null,
  connectedName: null
}

let wasNewSessionAtStart = !fs.existsSync(`${SESSION_PATH}/creds.json`)
let reconnectAttempts = 0
const MAX_RECONNECT = 5

async function startBot() {
  console.log('🚀 Iniciando Bridge OppsFlow Anti-Ban...')

  const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_PATH)
  const { version } = await fetchLatestBaileysVersion()

  state.sock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: true,
    browser: Browsers.baileys('Desktop'),
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    retryRequestDelayMs: 2000,
    logger: pino({ level: 'silent' })
  })

  state.sock.ev.on('creds.update', saveCreds)

  // ─── Eventos de Conexão ───────────────────────────────────────────────────
  state.sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      state.qrCodeBase64 = await QRCode.toDataURL(qr)
      state.connectionStatus = 'qr_ready'
      console.log('\n-------------------------------------------')
      console.log('NOVO QR CODE GERADO - ESCANEIE NO PAINEL')
      console.log('-------------------------------------------')
      fireWebhook('qr.generated', { qr: state.qrCodeBase64 })
    }

    if (connection === 'open') {
      state.qrCodeBase64 = null
      state.connectionStatus = 'connected'
      reconnectAttempts = 0

      if (state.sock.user) {
        state.connectedPhone = state.sock.user.id.split(':')[0]
        state.connectedName = state.sock.user.name
      }

      console.log('\n✅ WHATSAPP CONECTADO COM SUCESSO!\n')
      if (state.connectedPhone) console.log(`📱 Número: ${state.connectedPhone}`)

      fireWebhook('connection.update', {
        status: 'connected',
        phone: state.connectedPhone,
        name: state.connectedName
      })

      if (wasNewSessionAtStart) {
        state.isNewSession = true
        console.log('⏳ Nova sessão detectada — aguardando warm-up de 30s...')
        await humanDelay(30_000, 31_000)
        state.isNewSession = false
        wasNewSessionAtStart = false
        console.log('✅ Warm-up concluído. Sessão liberada para uso.')
      }
    }

    if (connection === 'close') {
      state.connectedPhone = null
      state.connectedName = null

      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      state.connectionStatus = 'disconnected'
      state.qrCodeBase64 = null

      console.log('Conexão fechada. Motivo:', lastDisconnect?.error?.message || 'Desconhecido')
      fireWebhook('connection.update', { status: 'disconnected', reason: lastDisconnect?.error?.message })

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('⚠️  Dispositivo desconectado (Logout). Limpando dados da sessão...')
        if (fs.existsSync(SESSION_PATH)) {
          fs.rmSync(SESSION_PATH, { recursive: true, force: true })
          wasNewSessionAtStart = true
        }
        reconnectAttempts = 0
        console.log('Sessão limpa. Reiniciando para gerar novo QR Code...')
        startBot()
      } else if (shouldReconnect) {
        if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++
          const backoff = 5000 * reconnectAttempts
          console.log(`Tentando reconectar em ${backoff / 1000}s (tentativa ${reconnectAttempts}/${MAX_RECONNECT})...`)
          setTimeout(startBot, backoff)
        } else {
          state.connectionStatus = 'failed'
          console.error('❌ Máximo de reconexões atingido. Reinicie o processo manualmente.')
          fireWebhook('connection.update', { status: 'failed', reason: 'max_reconnect_reached' })
        }
      }
    }
  })

  // ─── Mensagens Recebidas ──────────────────────────────────────────────────
  state.sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (msg.key.fromMe) continue // ignorar mensagens próprias

      const from = msg.key.remoteJid
      const isGroup = from.endsWith('@g.us')
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '[mídia/outro]'

      console.log(`📩 Mensagem recebida de ${from}: ${text}`)

      fireWebhook('message.received', {
        from,
        isGroup,
        text,
        messageId: msg.key.id,
        timestamp: msg.messageTimestamp,
        pushName: msg.pushName || null
      })
    }
  })
}

// ─── Envio com Presença Humanizada ─────────────────────────────────────────
async function sendWithPresence(jid, message) {
  await state.sock.sendPresenceUpdate('available', jid)

  await state.sock.sendPresenceUpdate('composing', jid)
  const typingTime = Math.min(message.length * 50, 8000)
  await humanDelay(typingTime, typingTime + 1000)

  await state.sock.sendPresenceUpdate('paused', jid)
  await humanDelay(300, 800)

  await state.sock.sendMessage(jid, { text: message })

  await state.sock.sendPresenceUpdate('unavailable', jid)
}

async function validateAndSend(number, message) {
  const jid = number.replace(/\D/g, '') + '@s.whatsapp.net'

  const [result] = await state.sock.onWhatsApp(jid)
  if (!result?.exists) {
    throw new Error(`Número ${number} não está no WhatsApp`)
  }

  checkRateLimit(jid)

  await sendWithPresence(jid, message)
}

module.exports = { startBot, state, validateAndSend }
