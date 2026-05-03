// ToolFunction/logger.js
const fs = require('fs').promises
const path = require('path')

const registerLogPath = path.join(__dirname, '..', 'log', 'register.log')

function getCSTTime() {
  const date = new Date()
  const offset = 8 * 60 * 60 * 1000
  const cst = new Date(date.getTime() + offset)
  return cst.toISOString().replace('Z', '+08:00')
}

async function ensureLogDir() {
  const dir = path.dirname(registerLogPath)
  await fs.mkdir(dir, { recursive: true })
}

async function logRegister(userId, userName, phone, ip, ua) {
  await ensureLogDir()
  const logEntry = `${getCSTTime()} - User registered: ID=${userId}, Name=${userName}, Phone=${phone}, IP=${ip}, UA=${ua}\n`
  await fs.appendFile(registerLogPath, logEntry)
}

module.exports = { logRegister }