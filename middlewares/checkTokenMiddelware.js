const jwt = require('jsonwebtoken')
const { secret } = require('../config/index.js')

const checkTokenMiddleware = async (req, res, next) => {
  // 从请求头中获取 Authorization 字段
  const authHeader = req.headers.authorization
  
  if (!authHeader) {
    return res.status(401).json({ code: 401, msg: '未登录' })
  }

  // 提取 token（格式通常是 "Bearer <token>"）
  const token = authHeader.split(' ')[1]
  if (!token) {
    return res.status(401).json({ code: 401, msg: 'token格式错误' })
  }

  try {
    // 验证 token 并解析出用户信息
    const decoded = jwt.verify(token, secret)
    // 将用户信息挂载到 req.user 上
    // 继续执行下一个中间件或路由处理函数
    const user = await UserModel.findById(decoded.userId).select('tokenVersion')
    if (!user || user.tokenVersion !== decoded.version) {
      return res.status(401).json({ code: 401, msg: '账号已在其他设备登录，请重新登录' })
    }
    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({ code: 401, msg: '登录已过期' })
  }
}

module.exports = checkTokenMiddleware