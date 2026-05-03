const express = require('express')
const router = express.Router()
const ReviewModel = require('../model/ReviewModel')
const ProductModel = require('../model/ProductModel')
const UserModel = require('../model/UserModel')
const NotificationModel = require('../model/NotificationModel')
const checkTokenMiddleware = require('../middlewares/checkTokenMiddleware')

router.use(checkTokenMiddleware)

// 添加评论
router.post('/add', async (req, res) => {
  try {
    const { productId, sellerId, orderId, content, proPhoto, avatar } = req.body
    const userId = req.user._id
    const userName = req.user.UserName

    if (!productId || !sellerId || !orderId || !content) {
      return res.status(400).json({ code: 400, msg: '商品ID、卖家ID、订单ID和评论内容不能为空' })
    }

    /**
     * 审核评论和图片
     */

    // 检查是否已评价过该订单
    const existing = await ReviewModel.findOne({ userId, orderId })
    if (existing) {
      return res.status(400).json({ code: 400, msg: '该订单已评价' })
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
      orderId,
      content,
      proPhoto: proPhoto || '',
      Avatar: avatar || ''
    })

    // 通知卖家
    await NotificationModel.create({
      userId: sellerId,
      type: 'new_review',
      title: '收到新评价',
      msg: `${userName} 评价了您的商品：${content}`,
      orderId
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

    const userIds = [...new Set(reviews.map(r => r.userId))]
    const users = await UserModel.find(
      { _id: { $in: userIds } },
      '_id Avatar'
    )
    const userAvatarMap = {}
    users.forEach(u => {
      userAvatarMap[u._id.toString()] = u.Avatar || ''
    })
    const enrichedReviews = reviews.map(r => {
      const review = r.toObject()
      review.Avatar = userAvatarMap[r.userId] || review.Avatar || ''
      return review
    })

    res.json({
      code: 200,
      data: enrichedReviews,
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