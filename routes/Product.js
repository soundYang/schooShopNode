const express = require('express')
const ProductModel = require('../model/product')
const UserModel = require('../model/UserModel')
const router = express.Router()

// 创建商品信息
router.post('/create', async (req,res) => {
  try {
    const currentUserId = req.body.userId
    const productData = {
      ...req.body,
      userId: currentUserId
    }

    const data = await ProductModel.create(productData)

    await UserModel.findByIdAndUpdate(
      currentUserId, 
      { $push: { ProductsPosted: data } },
      { new: true }
    )

    if(data) {
      res.send({
        code:200,
        msg:'创建成功'
      })
    } else {
      res.send({
        code:400,
        msg:'创建失败'
      })
    }
  } catch (err) {
    res.status(500).send(err)
  }
})

// 获取单个商品信息
router.get('/getPro', async (req,res) => {
  try {
    const data = await ProductModel.findOne({
      _id: req.query.id
    })
    if(!data) {
      return res.send({
        code:400,
        msg:'获取失败'
      })
    }
    res.send({
      code:200,
      data,
      msg:'获取成功'
    })
  } catch (err) {
    res.status(500).send(err)
  }
})
module.exports = router