const router = require('express').Router()
const { generateUserBlindBoxes, checkAndUpdateBlindBoxState } = require('../services/blindBoxService')
const BlindBoxRecord = require('../model/BlindBoxRecordModel')
const Product = require('../model/ProductModel')
const UserModel = require('../model/UserModel')
const OrderModel = require('../model/OrderModel')
const NotificationModel = require('../model/NotificationModel')
const checkTokenMiddleware = require('../middlewares/checkTokenMiddleware')

// 获取今日盲盒
router.get('/today', checkTokenMiddleware, async (req, res) => {
  const userId = req.user._id
  const today = new Date().toISOString().split('T')[0]

  let record = await BlindBoxRecord.findOne({ userId, date: today })

  if (!record) {
    const state = await checkAndUpdateBlindBoxState()
    if (!state.open) {
      return res.json({
        code: 200,
        open: false,
        count: state.count,
        data: []
      })
    }

    try {
      record = await generateUserBlindBoxes(userId, today)
    } catch (err) {
      console.log(err)
      return res.status(500).json({ code: 500, msg: err.message || '生成盲盒失败' })
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

  const state = await checkAndUpdateBlindBoxState()
  if (!state.open) {
    return res.status(400).json({ code: 400, msg: '盲盒已关闭' })
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

  // 原子扣库存
  const deducted = await Product.findOneAndUpdate(
    { _id: box.productId, shopNum: { $gt: 0 } },
    { $inc: { shopNum: -1 } },
    { returnDocument: 'after' }
  )
  if (!deducted) {
    await UserModel.findByIdAndUpdate(userId, { $inc: { Balance: total } })
    return res.status(400).json({ code: 400, msg: '该盲盒商品已售罄' })
  }
  if (deducted.shopNum === 0) {
    await Product.findByIdAndUpdate(box.productId, { shopStatus: 2 })
  }

  // 创建已支付订单（钱冻结在平台，卖家等确认收货后到账）
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

  await BlindBoxRecord.findOneAndUpdate(
    { userId, date: today, 'boxes._id': boxId },
    { $set: { 'boxes.$.status': 1, 'boxes.$.orderId': order._id, 'boxes.$.purchasedAt': new Date() } }
  )

  // 通知卖家
  await NotificationModel.create({
    userId: product.userId,
    type: 'order_paid',
    title: '盲盒已售出',
    msg: `您的盲盒商品已被购买，订单 #${order._id}`,
    orderId: order._id
  })

  res.json({ code: 200, data: { orderId: order._id } })
})

// 揭晓盲盒（仅揭晓，不创建订单）
router.put('/reveal/:boxId', checkTokenMiddleware, async (req, res) => {
  try {
    const userId = req.user._id
    const { boxId } = req.params
    const today = new Date().toISOString().split('T')[0]

    const record = await BlindBoxRecord.findOne({ userId, date: today })
    if (!record) return res.status(404).json({ code: 404, msg: '盲盒记录不存在' })

    const box = record.boxes.id(boxId)
    if (!box) return res.status(404).json({ code: 404, msg: '盲盒不存在' })
    if (box.isRevealed) {
      return res.json({
        code: 200,
        data: {
          randomPrice: box.randomPrice,
          productId: box.productId,
          productSnapshot: box.productSnapshot
        }
      })
    }

    const updated = await BlindBoxRecord.findOneAndUpdate(
      { userId, date: today, 'boxes._id': boxId },
      { $set: { 'boxes.$.isRevealed': true } },
      {  returnDocument: 'after'  }
    )

    if (!updated) return res.status(400).json({ code: 400, msg: '揭晓失败' })
    const updatedBox = updated.boxes.id(boxId)

    res.json({
      code: 200,
      data: {
        randomPrice: updatedBox.randomPrice,
        productId: updatedBox.productId,
        productSnapshot: updatedBox.productSnapshot
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 确认购买已揭晓的盲盒（创建待付款订单）
router.post('/create-order', checkTokenMiddleware, async (req, res) => {
  try {
    const userId = req.user._id
    const { boxId, deliverAddress } = req.body
    const today = new Date().toISOString().split('T')[0]

    if (!deliverAddress) {
      return res.status(400).json({ code: 400, msg: '请填写收货地址' })
    }

    const record = await BlindBoxRecord.findOne({ userId, date: today })
    if (!record) return res.status(404).json({ code: 404, msg: '盲盒记录不存在' })

    const box = record.boxes.id(boxId)
    if (!box) return res.status(404).json({ code: 404, msg: '盲盒不存在' })
    if (!box.isRevealed) return res.status(400).json({ code: 400, msg: '请先揭晓盲盒' })
    if (box.status === 1) return res.status(400).json({ code: 400, msg: '盲盒已购买' })

    const product = await Product.findById(box.productId)
    if (!product) return res.status(404).json({ code: 404, msg: '盲盒商品不存在' })

    if (String(userId) === String(product.userId)) {
      return res.status(400).json({ code: 400, msg: '不能购买自己的盲盒' })
    }

    const deducted = await Product.findOneAndUpdate(
      { _id: box.productId, shopNum: { $gt: 0 } },
      { $inc: { shopNum: -1 } },
      { returnDocument: 'after' }
    )
    if (!deducted) {
      return res.status(400).json({ code: 400, msg: '该盲盒商品已售罄' })
    }
    if (deducted.shopNum === 0) {
      await Product.findByIdAndUpdate(box.productId, { shopStatus: 2 })
    }

    const order = await OrderModel.create({
      buyerId: userId,
      sellerId: product.userId,
      productId: box.productId,
      quantity: 1,
      status: 0,
      deliverMethod: 0,
      deliverAddress,
      isBlindBox: true,
      unitPrice: box.randomPrice,
      orderTime: new Date()
    })

    await BlindBoxRecord.findOneAndUpdate(
      { userId, date: today, 'boxes._id': boxId },
      { $set: { 'boxes.$.status': 1, 'boxes.$.orderId': order._id, 'boxes.$.purchasedAt': new Date() } }
    )

    res.json({ code: 200, data: { orderId: order._id } })
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

  const history = records.reduce((acc, record) => {
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
      acc.push({ date: record.date, boxes: purchasedBoxes })
    }
    return acc
  }, [])

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
