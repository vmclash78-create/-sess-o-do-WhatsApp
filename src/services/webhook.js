const { WEBHOOK_URL, WEBHOOK_SECRET } = require('../config/env')

/**
 * Dispara um evento para a URL de webhook configurada no .env
 * Eventos possíveis: connection.update, qr.generated, message.sent,
 *                    message.failed, message.received, queue.update
 */
async function fireWebhook(event, data) {
  if (!WEBHOOK_URL) return

  try {
    const payload = {
      event,
      data,
      timestamp: new Date().toISOString()
    }

    const headers = { 'Content-Type': 'application/json' }
    if (WEBHOOK_SECRET) headers['x-webhook-secret'] = WEBHOOK_SECRET

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000) // Timeout de 5s para não travar
    })

    console.log(`🔔 Webhook [${event}] → ${WEBHOOK_URL} (${response.status})`)
  } catch (err) {
    // Falha no webhook nunca deve derrubar o fluxo principal
    console.error(`❌ Falha ao enviar webhook [${event}]: ${err.message}`)
  }
}

module.exports = { fireWebhook }
