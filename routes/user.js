const express = require('express')
const UserModel = require('../model/UserModel')
const router = express.Router()
const md5 = require('md5')
const { secret } = require('../config/index')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')

const checkTokenMiddleware = require('../middlewares/checkTokenMiddleware')

const logService = require('../ToolFunction/logService')
const { maskPhone, maskAddressesPhone } = require('../ToolFunction/maskPhone')
const captchaStore = require('../ToolFunction/captchaStore')

const { contentModeration } = require('../middlewares/contentModeration')

const ALLOWED_REGISTER_FIELDS = ['UserName', 'PassWord', 'PhoneNumber', 'StudentId', 'Avatar']

// 注册接口限流：每分钟最多 5 次，每小时最多 15 次
const registerMinuteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { code: 429, msg: '注册过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
})
const registerHourLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 25,
  message: { code: 429, msg: '注册过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
})

router.post('/userInfo', registerMinuteLimiter, registerHourLimiter, contentModeration({ checkFields: ['UserName'] }), async (req,res) => {
 try {
    const { captchaId, captchaText, ...userData } = req.body

    if (!captchaId || !captchaText) {
      return res.status(400).json({ code: 400, msg: '请完成图形验证码' })
    }
    if (!captchaStore.verify(captchaId, captchaText)) {
      return res.status(400).json({ code: 400, msg: '验证码错误或已过期' })
    }

    // 字段白名单过滤，防止 Mass Assignment 攻击
    const safeData = {}
    for (const key of ALLOWED_REGISTER_FIELDS) {
      if (userData[key] !== undefined) {
        safeData[key] = userData[key]
      }
    }
    safeData.PassWord = md5(safeData.PassWord || userData.PassWord)

    const newUser = await UserModel.create(safeData)

    setImmediate(() => {
      logService.register(
        newUser._id,
        newUser.UserName,
        newUser.PhoneNumber,
        req.ip,
        req.headers['user-agent']
      )
    })

    res.json({
      code: 200,
      msg: '创建用户成功'
    })
    
 } catch (error) {
  if (error.code === 11000) {
    // 根据错误信息判断哪个字段重复
    const field = Object.keys(error.keyPattern)[0]
    if (field === 'PhoneNumber') {
      return res.json({ code: 400, msg: '电话已存在' })
    } else if (field === 'UserName') {
      return res.json({ code: 400, msg: '用户名已存在' })
    }
  }
  
  res.status(500).json({ code: 500, msg: '服务器错误' })
 }
})

// 用户登陆
router.post('/login', async (req,res) => { 
  const { UserName, PassWord } = req.body

  if (!UserName || !PassWord) {
    return res.json({
      code: 400,
      msg: '用户名/手机号和密码不能为空'
    })
  }
  
  try {
    const loginQuery = { PassWord: md5(PassWord) }
    const phoneNum = Number(UserName)
    if (!isNaN(phoneNum) && UserName.length >= 10) {
      loginQuery.PhoneNumber = phoneNum
    } else {
      loginQuery.UserName = UserName
    }

    const data = await UserModel.findOne(loginQuery).populate([
      'Addresses',
      'defaultAddress'
    ]).lean()
    
    if(!data) {
     return res.json({
        code: 400,
        msg: '账号或密码错误'
      })
    }
   
    // 2. 原子递增 tokenVersion，确保并发下版本号唯一
    const updatedUser = await UserModel.findByIdAndUpdate(
      data._id,
      { $inc: { tokenVersion: 1 } },  // 每次登录版本号+1
      {  returnDocument: 'after' }
    )

    const token = jwt.sign({
      UserName: data.UserName,
      _id: data._id,
      version: updatedUser.tokenVersion
    }, secret, { expiresIn: '7d' })

    delete data.PassWord
    if (data.PhoneNumber) data.PhoneNumber = maskPhone(data.PhoneNumber)
    if (data.Addresses) maskAddressesPhone(data.Addresses)
    if (data.defaultAddress) maskAddressesPhone(data.defaultAddress)
    res.json({
      code: 200,
      data: {
        token,
        data
      },
      msg: '登陆成功'
    })
    setImmediate(() => {
      logService.login(data._id, data.UserName, req.ip, req.headers['user-agent'], true)
    })
  } catch (error) {
    console.log(error)
    
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
}) 

// 更新用户信息（含旧密码验证）
router.post('/updateUser', checkTokenMiddleware, contentModeration({ checkFields: ['UserName'] }), async (req, res) => {
  const { oldPassWord, ...fieldsToUpdate } = req.body

  // 如果修改密码，必须验证旧密码
  if (fieldsToUpdate.PassWord) {
    if (!oldPassWord) {
      return res.json({ code: 400, msg: '修改密码需提供旧密码' })
    }
    const user = await UserModel.findById(req.user._id)
    if (!user || user.PassWord !== md5(oldPassWord)) {
      return res.json({ code: 400, msg: '旧密码错误' })
    }
  }

  const allowedFields = ['PassWord', 'UserName', 'Avatar']
  const updateKeys = Object.keys(fieldsToUpdate)
  for (const key of updateKeys) {
    if (!allowedFields.includes(key)) {
      return res.json({ code: 400, msg: '权限不足' })
    }
  }

  const _id = req.user._id
  try {
    if (fieldsToUpdate.PassWord) fieldsToUpdate.PassWord = md5(fieldsToUpdate.PassWord)

    const data = await UserModel.findByIdAndUpdate(_id, fieldsToUpdate)
    if (!data) {
      return res.send({ code: 400, msg: '更新失败' })
    }
    res.send({ code: 200, msg: '更新成功' })
  } catch (error) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 用户密码是否正确
router.post('/pswGetInfo', checkTokenMiddleware, async (req, res) => {
  try {
    const data = await UserModel.findOne({
      _id: req.user._id,
      PassWord: md5(req.body.PassWord)
    })
    if (!data) {
      return res.send({
        code: 400,
        data:{
          isExist: false,
        },
        msg: '旧密码错误'
      })
    }
    res.send({
      code: 200,
      data:{
        isExist: true,
      }
    })
  } catch (error) {
    console.log(error)
    
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取用户信息
router.get('/getUserInfo', checkTokenMiddleware, async (req, res) => {
  try {
    const data = await UserModel.findOne({
      _id: req.user._id
    }, '-PassWord').populate([
      'Addresses',
      'defaultAddress'
    ]).lean()

    if (data) {
      if (data.PhoneNumber) data.PhoneNumber = maskPhone(data.PhoneNumber)
      if (data.Addresses) maskAddressesPhone(data.Addresses)
      if (data.defaultAddress) maskAddressesPhone(data.defaultAddress)
    }

    res.send({
      code: 200,
      data
    })
  } catch (error) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})
/**
 *  电话修改
 *  学号修改
 */

// 通过id获取用户简要信息
router.get('/UserSimpleInfo', checkTokenMiddleware, async (req, res) => { 
  try {
   
    
    const data = await UserModel.findOne({
      _id: req.query.id
    }, 'UserName Avatar _id')
    
    res.send({
      code: 200,
      data
    })
  } catch (error) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 确认用户是否存在
router.get('/checkUser', checkTokenMiddleware, async (req, res) => { 
  try {
    const { id } = req.query
    const data = await UserModel.findOne({
      _id: id
    })
    if (data) {
      res.send({
        code: 200,
        data:{
          isExist: true
        }
      })
    } else {
      res.send({
        code: 400,
        data:{
          isExist: false,
          msg: '用户不存在'
        }
      })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})
module.exports = router