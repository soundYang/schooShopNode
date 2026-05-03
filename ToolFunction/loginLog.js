const fs = require('fs').promises
const path = require('path')

const logFilePath = path.join(__dirname, '..', 'log', 'login.log')

function getCSTTime() {
  const date = new Date()
  const offset = 8 * 60 * 60 * 1000
  const cst = new Date(date.getTime() + offset)
  return cst.toISOString().replace('Z', '+08:00')
}

async function loginLog(userId, ip, ua) {
  const logDir = path.dirname(logFilePath)
  try {
    await fs.mkdir(logDir, { recursive: true })
  } catch (err) {
  }

  const logEntry = `${getCSTTime()} - User ${userId} logged in from ${ip} - ${ua}\n`
  await fs.appendFile(logFilePath, logEntry)
}

module.exports = { loginLog }