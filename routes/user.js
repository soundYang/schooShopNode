const express = require('express')
const UserModel = require('../model/UserModel')
const router = express.Router()
const md5 = require('md5')
const { secret } = require('../config/index')
const jwt = require('jsonwebtoken')

const checkTokenMiddleware = require('../middlewares/checkTokenMiddelware')

const { loginLog } = require('../ToolFunction/loginLog')  // 登录日志
const { logRegister } = require('../ToolFunction/loggerLog') // 注册日志

// 创建用户
router.post('/userInfo', async (req,res) => {
 try {
    
    /**
     * 数据校验
     */
    const newUser = await UserModel.create({
      ...req.body,
      PassWord:md5(req.body.PassWord)
    })

    // 异步记录注册日志（不阻塞响应）
    setImmediate(() => {
      logRegister(
        newUser._id,
        newUser.UserName,
        newUser.PhoneNumber,
        req.ip,
        req.headers['user-agent']
      ).catch(err => console.error('注册日志写入失败:', err))
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

  /**
   * 数据校验
   */
  
  try {
    const data = await UserModel.findOne({
      UserName,
      PassWord: md5(PassWord)
    }).populate([
      'Addresses'
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
      { new: true }
    )

    const token = jwt.sign({
      UserName: data.UserName,
      _id: data._id,
      version: updatedUser.tokenVersion
    }, secret, { expiresIn: '7d' })

    delete data.PassWord
    res.json({
      code: 200,
      data: {
        token,
        data
      },
      msg: '登陆成功'
    })
    setImmediate(() => {
      loginLog(data._id, req.ip, req.headers['user-agent']).catch(err => {
        console.error('日志记录失败:', err) // 仅记录，不影响主流程
      })
    })
  } catch (error) {
    console.log(error)
    
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
}) 

// 更新用户信息
router.post('/updateUser',checkTokenMiddleware, async (req, res) => { 
  const _id = req.user._id
  console.log(req.body)
  
  try {
    /**
     * 头像审核 
     */

    if(req.body.PassWord) req.body.PassWord = md5(req.body.PassWord)

    const data = await UserModel.findByIdAndUpdate(_id, {
      ...req.body
    })
    if (!data) {
      return res.send({
        code: 400,
        msg: '更新失败'
      })
    }
    res.send({
      code: 200,
      msg: '更新成功'
    })
  } catch (error) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 用户密码是否正确
router.get('/pswGetInfo', checkTokenMiddleware, async (req, res) => { 
  try {
    const data = await UserModel.findOne({
      _id: req.user._id,
      PassWord: md5(req.query.PassWord)
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
    }, '-password')
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

module.exports = router