function humanDelay(minMs = 1500, maxMs = 5000) {
  const base = Math.random() * (maxMs - minMs) + minMs
  const jitter = (Math.random() - 0.5) * 800
  return new Promise(res => setTimeout(res, Math.max(500, base + jitter)))
}

module.exports = { humanDelay }
