const fs = require('fs').promises
const path = require('path')

// 定义日志文件路径（放在项目根目录下的 log 文件夹中）
const logFilePath = path.join(__dirname, '..', 'log', 'login.log')

async function loginLog(userId, ip, ua) {
// 确保 log 目录存在（如果不存在则创建）
const logDir = path.dirname(logFilePath)
try {
  await fs.mkdir(logDir, { recursive: true })
} catch (err) {
  // 目录已存在或创建失败时忽略（或记录错误）
}

const logEntry = `${new Date().toISOString()} - User ${userId} logged in from ${ip} - ${ua}\n`
await fs.appendFile(logFilePath, logEntry)
}

module.exports = { loginLog }