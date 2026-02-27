const jwt = require('jsonwebtoken')
const { secret } = require('../config/index.js')

const checkTokenMiddleware = (req, res, next) => {
  // 从请求头中获取 Authorization 字段
  const authHeader = req.headers.authorization
  
  if (!authHeader) {
    return res.status(401).json({ code: 401, msg: '未提供认证令牌' })
  }

  // 提取 token（格式通常是 "Bearer <token>"）
  const token = authHeader.split(' ')[1]
  if (!token) {
    return res.status(401).json({ code: 401, msg: '令牌格式错误' })
  }

  try {
    // 验证 token 并解析出用户信息
    const decoded = jwt.verify(token, secret)
    // 将用户信息挂载到 req.user 上
    req.user = decoded
    // 继续执行下一个中间件或路由处理函数
    next()
  } catch (error) {
    return res.status(401).json({ code: 401, msg: '令牌无效或已过期' })
  }
}

module.exports = checkTokenMiddleware