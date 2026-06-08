require('dotenv').config()

module.exports = {
  PORT: process.env.PORT || 3001,
  SESSION_PATH: process.env.SESSION_PATH || './session_data',
  API_KEY: process.env.API_KEY,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
  WEBHOOK_URL: process.env.WEBHOOK_URL || null,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || null
}
