const router = require('express').Router()
const { generateUserBlindBoxes } = require('../services/blindBoxService')
const BlindBoxRecord = require('../model/BlindBoxRecordModel')
const Product = require('../model/ProductModel')
const UserModel = require('../model/UserModel')
const OrderModel = require('../model/OrderModel')
const NotificationModel = require('../model/NotificationModel')
const checkTokenMiddleware = require('../middlewares/checkTokenMiddelware')

// 获取今日盲盒
router.get('/today', checkTokenMiddleware, async (req, res) => {
  const userId = req.user._id
  const today = new Date().toISOString().split('T')[0]

  let record = await BlindBoxRecord.findOne({ userId, date: today })
  if (!record) {
    try {
      record = await generateUserBlindBoxes(userId, today)
    } catch (err) {
      console.log(err)
      return res.status(500).json({ code: 500, msg: '生成盲盒失败' })
    }
  }

  const boxesData = record.boxes.map(box => ({
    _id: box._id,
    randomPrice: box.randomPrice,
    status: box.status,
    isRevealed: box.isRevealed || false,
    createdAt: box.createdAt,
    label: box.productSnapshot.label || '',
    orderId: box.orderId || undefined
  }))

  res.json({ code: 200, data: boxesData })
})

// 购买盲盒（直接扣余额，一步完成）
router.post('/buy', checkTokenMiddleware, async (req, res) => {
  const userId = req.user._id
  const { boxId } = req.query
  const today = new Date().toISOString().split('T')[0]
  const { deliverAddress } = req.body

  if (!deliverAddress) {
    return res.status(400).json({ code: 400, msg: '请填写收货地址' })
  }

  const record = await BlindBoxRecord.findOne({ userId, date: today })
  if (!record) {
    return res.status(404).json({ code: 404, msg: '今日盲盒不存在' })
  }

  const box = record.boxes.id(boxId)
  if (!box) return res.status(404).json({ code: 404, msg: '盲盒不存在' })
  if (box.status === 1) return res.status(400).json({ code: 400, msg: '盲盒已购买' })

  const product = await Product.findById(box.productId)

  // 不能购买自己的盲盒
  if (String(userId) === String(product.userId)) {
    return res.status(400).json({ code: 400, msg: '不能购买自己的盲盒' })
  }

  // 检查余额并直接扣款
  const total = box.randomPrice
  const buyer = await UserModel.findById(userId)
  if (!buyer || buyer.Balance < total) {
    return res.status(400).json({ code: 400, msg: '余额不足' })
  }

  await UserModel.findByIdAndUpdate(userId, { $inc: { Balance: -total } })
  await UserModel.findByIdAndUpdate(product.userId, { $inc: { Balance: total } })

  // 创建已支付订单
  const order = await OrderModel.create({
    buyerId: userId,
    sellerId: product.userId,
    productId: box.productId,
    quantity: 1,
    status: 1,
    deliverMethod: 0,
    deliverAddress: deliverAddress,
    isBlindBox: true,
    unitPrice: box.randomPrice,
    orderTime: new Date(),
    payTime: new Date(),
    expireAt: null
  })

  // 更新盲盒状态
  box.status = 1
  box.purchasedAt = new Date()
  await record.save()

  // 通知卖家
  await NotificationModel.create({
    userId: product.userId,
    type: 'order_paid',
    title: '盲盒已售出',
    message: `您的盲盒商品已被购买，订单 #${order._id}`,
    orderId: order._id
  })

  res.json({ code: 200, data: { orderId: order._id } })
})

// 揭晓盲盒（自动创建待付款订单 + 揭晓）
router.put('/reveal/:boxId', checkTokenMiddleware, async (req, res) => {
  try {
    const userId = req.user._id
    const { boxId } = req.params
    const today = new Date().toISOString().split('T')[0]

    const record = await BlindBoxRecord.findOne({ userId, date: today })
    if (!record) return res.status(404).json({ code: 404, msg: '盲盒记录不存在' })

    const box = record.boxes.id(boxId)
    if (!box) return res.status(404).json({ code: 404, msg: '盲盒不存在' })
    if (box.isRevealed) return res.status(400).json({ code: 400, msg: '盲盒已揭晓' })

    // 如果尚未购买，自动创建待付款订单（地址为空，用户在订单详情页设置）
    if (box.status === 0) {
      const product = await Product.findById(box.productId)
      if (!product) return res.status(404).json({ code: 404, msg: '盲盒商品不存在' })

      if (String(userId) === String(product.userId)) {
        return res.status(400).json({ code: 400, msg: '不能购买自己的盲盒' })
      }

      const order = await OrderModel.create({
        buyerId: userId,
        sellerId: product.userId,
        productId: box.productId,
        quantity: 1,
        status: 0,
        deliverMethod: 0,
        deliverAddress: null,
        isBlindBox: true,
        unitPrice: box.randomPrice,
        orderTime: new Date(),
        expireAt: null
      })

      box.status = 1
      box.orderId = order._id
      box.purchasedAt = new Date()
      await record.save()
    }

    box.isRevealed = true
    await record.save()

    res.json({
      code: 200,
      data: {
        randomPrice: box.randomPrice,
        label: box.productSnapshot.label || '',
        orderId: box.orderId
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取历史盲盒购买记录
router.get('/history', checkTokenMiddleware, async (req, res) => {
  const userId = req.user._id
  const { page = 1, pageSize = 20 } = req.query
  const skip = (parseInt(page) - 1) * parseInt(pageSize)
  const limit = parseInt(pageSize)

  const [records, total] = await Promise.all([
    BlindBoxRecord.find({ userId })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    BlindBoxRecord.countDocuments({ userId })
  ])

  const history = []
  for (const record of records) {
    const purchasedBoxes = record.boxes
      .filter(box => box.status === 1)
      .map(box => ({
        _id: box._id,
        randomPrice: box.randomPrice,
        status: box.status,
        isRevealed: box.isRevealed || false,
        productSnapshot: box.productSnapshot,
        createdAt: box.createdAt,
        purchasedAt: box.purchasedAt
      }))
    if (purchasedBoxes.length > 0) {
      history.push({ date: record.date, boxes: purchasedBoxes })
    }
  }

  res.json({
    code: 200,
    data: history,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    totalPages: Math.ceil(total / pageSize)
  })
})

module.exports = router
