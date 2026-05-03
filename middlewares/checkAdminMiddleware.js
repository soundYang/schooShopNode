const jwt = require('jsonwebtoken')
const { secret } = require('../config/index.js')
const AdminModel = require('../model/AdminModel.js')

const checkAdminMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ code: 401, msg: '未登录' })
  }

  const token = authHeader.split(' ')[1]
  if (!token) {
    return res.status(401).json({ code: 401, msg: 'token格式错误' })
  }

  try {
    const decoded = jwt.verify(token, secret)
    const admin = await AdminModel.findById(decoded._id).select('tokenVersion role status')

    if (!admin) {
      return res.status(401).json({ code: 401, msg: '管理员不存在' })
    }
    if (!admin.status) {
      return res.status(403).json({ code: 403, msg: '管理员账号已禁用' })
    }
    if (admin.tokenVersion !== decoded.version) {
      return res.status(401).json({ code: 401, msg: '账号已在其他设备登录' })
    }

    req.admin = { _id: decoded._id, username: decoded.username, role: admin.role }
    next()
  } catch (error) {
    return res.status(401).json({ code: 401, msg: '登录已过期' })
  }
}

module.exports = checkAdminMiddleware
