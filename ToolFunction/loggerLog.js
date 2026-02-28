// ToolFunction/logger.js
const fs = require('fs').promises
const path = require('path')

// 日志文件路径：项目根目录/log/register.log
const registerLogPath = path.join(__dirname, '..', 'log', 'register.log')

// 确保日志目录存在（可在应用启动时调用一次，或每次写入时检查）
async function ensureLogDir() {
  const dir = path.dirname(registerLogPath)
  await fs.mkdir(dir, { recursive: true })
}

// 注册日志函数
async function logRegister(userId, userName, phone, ip, ua) {
  // 确保目录存在（每次写入前检查，开销很小，也可在启动时执行一次）
  await ensureLogDir()
  const timestamp = new Date().toISOString()
  const logEntry = `${timestamp} - User registered: ID=${userId}, Name=${userName}, Phone=${phone}, IP=${ip}, UA=${ua}\n`
  await fs.appendFile(registerLogPath, logEntry)
}

module.exports = { logRegister }