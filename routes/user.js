const express = require('express')
const UserModel = require('../model/UserModel')
const router = express.Router()
const md5 = require('md5')
const { secret } = require('../config.js/index')
const jwt = require('jsonwebtoken')

// 创建用户
router.post('/userInfo', async (req,res) => {
 try {

    // 手机号识别用户唯一性
    const user = await UserModel.findOne({
      PhoneNumber: req.body.PhoneNumber
    })
    if(user) {
      return res.json({
        code: 200,
        message: '手机号已存在'
      })
    }

  await UserModel.create({
      ...req.body,
      PassWord:md5(req.body.PassWord)
    })
    res.json({
      code: 200,
      message: '创建用户成功'
    })
 } catch (error) {
  res.status(500).send(error)
 }
})

// 用户登陆
router.post('/login', async (req,res) => { 
  const { UserName, PassWord } = req.body
  try {
    const data = await UserModel.findOne({
      UserName,
      PassWord: md5(PassWord)
    }).lean()

    if(!data) {
     return res.json({
        code: 400,
        message: '用户名或密码错误'
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
      message: '登陆成功'
    })
  } catch (error) {
    res.status(500).send(error)
  }
}) 

module.exports = router