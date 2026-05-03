const jwt = require('jsonwebtoken')
const { secret } = require('../config/index.js')
const UserModel = require('../model/UserModel.js')

const checkTokenMiddleware = async (req, res, next) => {
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
    const user = await UserModel.findById(decoded._id).select('tokenVersion')
    
    if (!user || user.tokenVersion !== decoded.version) {
      return res.status(401).json({ code: 401, msg: '账号已在其他设备登录，请重新登录' })
    }
    req.user = decoded
    next()
  } catch (error) {
    console.log(error)
    return res.status(401).json({ code: 401, msg: '登录已过期' })
  }
}

module.exports = checkTokenMiddleware
