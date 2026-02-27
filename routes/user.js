const express = require('express')
const UserModel = require('../model/UserModel')
const router = express.Router()
const md5 = require('md5')
const { secret } = require('../config/index')
const jwt = require('jsonwebtoken')

const checkTokenMiddleware = require('../middlewares/checkTokenMiddelware')

// 创建用户
router.post('/userInfo', async (req,res) => {
 try {
    
    /**
     * 数据校验
     */

    // 手机号和名称识别用户唯一性
    const phone = await UserModel.findOne({
      PhoneNumber: req.body.PhoneNumber
    })
    const name = await UserModel.findOne({
      name: req.body.name
    })
    if( phone ) {
      return res.json({
        code: 200,
        msg: '电话已存在'
      })
    }
    if( name ) {
      return res.json({
        code: 200,
        msg: '用户名已存在'
      })
    }

  await UserModel.create({
      ...req.body,
      PassWord:md5(req.body.PassWord)
    })
    res.json({
      code: 200,
      msg: '创建用户成功'
    })
 } catch (error) {
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

    const token = jwt.sign({
      UserName: data.UserName,
      _id: data._id
    }, secret, { expiresIn: 60 * 60 * 24 * 7 })

    delete data.PassWord
    res.json({
      code: 200,
      data: {
        token,
        data
      },
      msg: '登陆成功'
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