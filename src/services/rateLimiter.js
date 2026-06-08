const messageLog = new Map()
const RATE_LIMIT_PER_JID_MS = 60_000 // 1 msg/min por número
let hourlyCount = 0
let hourlyReset = Date.now() + 3_600_000

function checkRateLimit(jid) {
  const now = Date.now()
  
  if (now > hourlyReset) {
    hourlyCount = 0
    hourlyReset = now + 3_600_000
  }
  
  if (hourlyCount >= 30) {
    throw new Error('Limite horário atingido (30 msgs/hora). Aguarde.')
  }
  
  const lastSent = messageLog.get(jid) || 0
  if (now - lastSent < RATE_LIMIT_PER_JID_MS) {
    const wait = Math.ceil((RATE_LIMIT_PER_JID_MS - (now - lastSent)) / 1000)
    throw new Error(`Aguarde ${wait}s antes de enviar novamente para este número`)
  }
  
  messageLog.set(jid, now)
  hourlyCount++
}

function getRateLimitState() {
  return {
    hourlyCount,
    hourlyLimit: 30,
    hourlyResetIn: Math.ceil((hourlyReset - Date.now()) / 1000)
  }
}

module.exports = { checkRateLimit, getRateLimitState }
