const { humanDelay } = require('../utils/delay')
const { fireWebhook } = require('./webhook')

// Fila em memória: cada item = { id, number, message, status, createdAt, ... }
const queue = []
let isProcessing = false
let totalProcessed = 0
let totalFailed = 0

// Importação lazy para evitar circular dependency
function getWhatsApp() {
  return require('./whatsapp')
}

/**
 * Adiciona uma mensagem à fila e retorna o ID gerado.
 * O envio acontece em background, respeitando delays anti-ban (10–45s entre msgs).
 */
function enqueue(number, message) {
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const item = {
    id,
    number,
    message,
    status: 'pending',
    createdAt: new Date().toISOString()
  }

  queue.push(item)
  console.log(`📥 Mensagem enfileirada [${id}] para ${number}. Fila: ${queue.length} item(s).`)

  fireWebhook('queue.update', { id, number, status: 'pending', queueSize: queue.length })

  // Inicia processamento em background sem await (não bloqueia a resposta HTTP)
  processQueue().catch(err => console.error('Erro no processador de fila:', err.message))

  return id
}

async function processQueue() {
  if (isProcessing) return // já existe um loop rodando
  isProcessing = true

  while (queue.length > 0) {
    const item = queue[0]
    item.status = 'processing'

    try {
      const { validateAndSend } = getWhatsApp()
      await validateAndSend(item.number, item.message)

      item.status = 'sent'
      item.sentAt = new Date().toISOString()
      totalProcessed++

      console.log(`✅ Fila processada: [${item.id}] → ${item.number}`)
      fireWebhook('message.sent', { id: item.id, number: item.number, sentAt: item.sentAt })
    } catch (err) {
      item.status = 'failed'
      item.error = err.message
      item.failedAt = new Date().toISOString()
      totalFailed++

      console.error(`❌ Falha na fila: [${item.id}] → ${err.message}`)
      fireWebhook('message.failed', { id: item.id, number: item.number, error: err.message })
    }

    queue.shift() // remove o item processado

    // Delay humano entre mensagens: 10s–45s (recomendação da comunidade Evolution API)
    if (queue.length > 0) {
      const nextNumber = queue[0]?.number || 'próximo'
      console.log(`⏳ Aguardando antes do próximo envio (anti-ban)... Fila restante: ${queue.length}`)
      await humanDelay(10_000, 45_000)
    }
  }

  isProcessing = false
}

function getQueueStatus() {
  return {
    isProcessing,
    pending: queue.filter(i => i.status === 'pending').length,
    processing: queue.filter(i => i.status === 'processing').length,
    totalProcessed,
    totalFailed,
    items: queue.map(i => ({
      id: i.id,
      number: i.number,
      status: i.status,
      createdAt: i.createdAt,
      sentAt: i.sentAt || null,
      error: i.error || null
    }))
  }
}

module.exports = { enqueue, getQueueStatus }
