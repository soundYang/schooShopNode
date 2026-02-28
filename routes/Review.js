const express = require('express')
const router = express.Router()
const ReviewModel = require('../model/ReviewModel')
const ProductModel = require('../model/ProductModel')
const UserModel = require('../model/UserModel')
const checkTokenMiddleware = require('../middlewares/checkTokenMiddelware')

router.use(checkTokenMiddleware)

// 添加评论
router.post('/add', async (req, res) => {
  try {
    const { productId, sellerId, content, proPhoto, avatar } = req.body
    const userId = req.user._id
    const userName = req.user.UserName

    if (!productId || !sellerId || !content) {
      return res.status(400).json({ code: 400, msg: '商品ID、卖家ID和评论内容不能为空' })
    }

    /**
     * 审核评论和图片
     */

    // 可选：检查是否已评价过该商品
    const existing = await ReviewModel.findOne({ userId, productId })
    if (existing) {
      return res.status(400).json({ code: 400, msg: '您已经评价过该商品' })
    }

    // 验证商品是否存在且卖家ID与商品所属卖家一致（防止恶意评价）
    const product = await ProductModel.findById(productId)
    if (!product) {
      return res.status(404).json({ code: 404, msg: '商品不存在' })
    }
    if (product.userId !== sellerId) {
      return res.status(400).json({ code: 400, msg: '卖家ID与商品所属卖家不匹配' })
    }

    // 验证卖家是否存在
    const seller = await UserModel.findById(sellerId)
    if (!seller) {
      return res.status(404).json({ code: 404, msg: '卖家不存在' })
    }

    // 创建评论
    const review = await ReviewModel.create({
      userName,
      userId,
      sellerId,
      productId,
      content,
      proPhoto: proPhoto || '',
      Avatar: avatar || ''
    })

    // 将评论ID添加到卖家的 SellerReview 数组
    await UserModel.findByIdAndUpdate(sellerId, {
      $push: { SellerReview: review._id }
    })

    res.json({ code: 200, data: review, msg: '评论成功' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 删除评论
router.delete('/del', async (req, res) => {
  try {
    const { reviewId } = req.query   // 获取评论ID
    const userId = req.user._id

    const review = await ReviewModel.findById(reviewId)
    if (!review) {
      return res.status(404).json({ code: 404, msg: '评论不存在' })
    }

    // 只有评论作者可删除
    if (review.userId !== userId) {
      return res.status(403).json({ code: 403, msg: '无权删除此评论' })
    }

    // 从卖家的 SellerReview 数组中移除该评论ID
    await UserModel.findByIdAndUpdate(review.sellerId, {
      $pull: { SellerReview: reviewId }
    })

    // 删除评论
    await ReviewModel.findByIdAndDelete(reviewId)

    res.json({ code: 200, msg: '删除成功' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})


// 获取评论列表（支持按商品、用户、卖家筛选）
router.get('/list', async (req, res) => {
  try {
    const { productId, userId, sellerId, page = 1, pageSize = 10 } = req.query
    const query = {}
    if (productId) query.productId = productId
    if (userId) query.userId = userId
    if (sellerId) query.sellerId = sellerId

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [reviews, total] = await Promise.all([
      ReviewModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ time: -1 }),
      ReviewModel.countDocuments(query)
    ])

    res.json({
      code: 200,
      data: reviews,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

module.exports = router