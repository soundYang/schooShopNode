const express = require('express')
const router = express.Router()
const ReviewModel = require('../model/ReviewModel')
const ReviewQueueModel = require('../model/ReviewQueueModel')
const ProductModel = require('../model/ProductModel')
const UserModel = require('../model/UserModel')
const NotificationModel = require('../model/NotificationModel')
const checkTokenMiddleware = require('../middlewares/checkTokenMiddleware')
const { scanText } = require('../middlewares/contentModeration')
const { moderateImagesAsync } = require('../middlewares/imageModeration')
const path = require('path')

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

    // 创建评论（先统一设为 pending，后续 AI 审核通过再改为 approved）
    const reviewData = {
      userName,
      userId,
      sellerId,
      productId,
      orderId,
      content,
      proPhoto: proPhoto || '',
      Avatar: avatar || '',
      status: 'pending'
    }
    const review = await ReviewModel.create(reviewData)

    // 文字审核：Trie/Baidu命中直接打回，Baidu异常进审核队列
    let contentHits = []
    try {
      contentHits = await scanText(content)
    } catch (e) {
      console.error('评价文字审核异常:', e.message)
      contentHits = ['百度审核异常，需人工复审']
    }

    const textBaiduError = contentHits.includes('百度审核异常，需人工复审')
    const textRealHit = contentHits.length > 0 && !textBaiduError

    if (textRealHit) {
      await ReviewModel.findByIdAndDelete(review._id)
      return res.json({ code: 400, msg: '评论不合规' })
    }

    let imagePassed = true
    let imageResult = null
    const hasLocalImage = proPhoto && typeof proPhoto === 'string' && !proPhoto.startsWith('http')
    if (hasLocalImage) {
      try {
        const mockFile = { path: path.join(__dirname, '..', proPhoto) }
        imageResult = await moderateImagesAsync([mockFile])
        imagePassed = imageResult.passed
      } catch (e) {
        console.error('评价图片审核失败:', e)
        imagePassed = false
        imageResult = { reason: '图片审核异常，需人工复审', details: ['审核异常'] }
      }
    }

    if (imagePassed && !textBaiduError) {
      await ReviewModel.findByIdAndUpdate(review._id, { status: 'approved' })
      await NotificationModel.create({
        userId: sellerId,
        type: 'new_review',
        title: '收到新评价',
        msg: `${userName} 评价了您的商品：${content}`,
        orderId
      })
      return res.json({ code: 200, data: review, msg: '评论成功' })
    }

    // 文字百度异常 或 图片违规 → 进审核队列
    const existingEntry = await ReviewQueueModel.findOne({
      targetType: 'review',
      targetId: review._id
    })

    const violationTypes = []
    if (textBaiduError) violationTypes.push('text')
    if (!imagePassed) violationTypes.push('image')

    const entryData = {
      content: content.substring(0, 200),
      images: proPhoto ? [proPhoto] : [],
      violationType: violationTypes.length === 2 ? 'both' : violationTypes[0],
      reason: [
        textBaiduError ? '文字审核异常，需人工复审' : '',
        !imagePassed ? `图片疑似违规: ${imageResult?.reason || '检测未通过'}` : ''
      ].filter(Boolean).join('；'),
      hitWords: [...(textBaiduError ? ['审核异常'] : []), ...(imageResult?.details || [])],
      submittedBy: userId
    }

    if (existingEntry) {
      await ReviewQueueModel.findByIdAndUpdate(existingEntry._id, { ...entryData, status: 'pending' })
      console.log(`评价 ${review._id} 已有待审核记录，已更新违规内容`)
    } else {
      await ReviewQueueModel.create({
        ...entryData,
        targetType: 'review',
        targetId: review._id,
        status: 'pending'
      })
      console.log(`评价 ${review._id} 审核异常，已提交审核队列`)
    }

    await NotificationModel.create({
      userId: sellerId,
      type: 'new_review',
      title: '收到新评价',
      msg: `${userName} 评价了您的商品：${content}`,
      orderId
    })

    res.json({ code: 200, data: review, msg: '评论成功，等待管理员审核' })
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
    const query = { status: 'approved' }
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