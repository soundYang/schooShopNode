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
    }).populate(['ProductsPosted','Addresses','defaultAddress']).lean()
    
    if(!data) {
     return res.json({
        code: 400,
        msg: '账号或密码错误'
      })
    }

    // 2. 原子递增 tokenVersion，确保并发下版本号唯一
    const updatedUser = await UserModel.findByIdAndUpdate(
      user._id,
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
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
}) 

// 更新用户信息
router.post('/updateUser',checkTokenMiddleware, async (req, res) => { 
  const _id = req.user._id
  try {
    const { UserName, PassWord, Avatar } = req.body

    /**
     * 头像审核 
     */

    const data = await UserModel.findByIdAndUpdate(_id, {
      UserName,
      PassWord:md5(PassWord),
      Avatar
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

/**
 *  电话修改
 *  学号修改
 */

module.exports = router