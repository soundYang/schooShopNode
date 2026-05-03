const LogModel = require('../model/LogModel')
const fs = require('fs')
const path = require('path')

function getCSTTime() {
  const date = new Date()
  const offset = 8 * 60 * 60 * 1000
  const cst = new Date(date.getTime() + offset)
  return cst.toISOString().replace('Z', '+08:00')
}

async function writeToFile(type, data) {
  const logDir = path.join(__dirname, '..', 'log')
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    const fileName = `${type}.log`
    const line = `${getCSTTime()} | ${data.level || 'info'} | ${data.action || '-'} | ${data.username || '-'} | ${data.detail || '-'} | ${data.ip || '-'}\n`
    fs.appendFileSync(path.join(logDir, fileName), line)
  } catch (err) {
    console.error(`[LogService] 文件写入失败:`, err.message)
  }
}

function sanitize(data) {
  const safe = { ...data }
  if (safe.detail && typeof safe.detail === 'string' && safe.detail.length > 500) {
    safe.detail = safe.detail.substring(0, 500) + '...'
  }
  return safe
}

const logService = {
  async write(type, data = {}) {
    try {
      const logData = sanitize({
        type,
        level: data.level || 'info',
        userId: data.userId || null,
        adminId: data.adminId || null,
        username: data.username || '',
        action: data.action || '',
        target: data.target || '',
        targetId: data.targetId || '',
        detail: data.detail || '',
        ip: data.ip || '',
        userAgent: data.userAgent || '',
        status: data.status || 'success',
        duration: data.duration || 0,
        path: data.path || '',
        method: data.method || '',
        createdAt: new Date()
      })

      await LogModel.create(logData).catch(() => {})
      writeToFile(type, logData)
    } catch (err) {
      console.error(`[LogService] 日志写入失败:`, err.message)
    }
  },

  async login(userId, username, ip, ua, success = true) {
    await logService.write('login', {
      level: success ? 'info' : 'warn',
      userId,
      username,
      action: success ? '登录成功' : '登录失败',
      detail: `用户 ${username} ${success ? '登录成功' : '登录失败'}`,
      ip,
      userAgent: ua,
      status: success ? 'success' : 'fail'
    })
  },

  async register(userId, username, phone, ip, ua) {
    await logService.write('register', {
      level: 'info',
      userId,
      username,
      action: '注册账号',
      detail: `新用户注册: 用户名=${username}, 手机号=${phone}`,
      ip,
      userAgent: ua
    })
  },

  async admin(adminId, username, action, detail, ip) {
    await logService.write('admin', {
      level: 'info',
      adminId,
      username,
      action,
      detail,
      ip
    })
  },

  async operation(userId, username, action, target, targetId, detail, ip) {
    await logService.write('operation', {
      level: 'info',
      userId,
      username,
      action,
      target,
      targetId,
      detail,
      ip
    })
  },

  async error(action, detail, path, method) {
    await logService.write('error', {
      level: 'error',
      action,
      detail,
      path,
      method,
      status: 'fail'
    })
  },

  async system(action, detail) {
    await logService.write('system', {
      level: 'info',
      action,
      detail
    })
  }
}

module.exports = logService
