/**
 * 订单状态：
 * 0待付款，
 * 1已付款待发货，
 * 2已发货待收货，
 * 3已完成，
 * 4已取消 
 * 5退款中
 */

/**
 * 自己不能购买自己的商品
 */

const express = require('express')
const router = express.Router()
const OrderModel = require('../model/OrderModel')
const ProductModel = require('../model/ProductModel')
const UserModel = require('../model/UserModel')
const NotificationModel = require('../model/NotificationModel')

const checkTokenMiddleware = require('../middlewares/checkTokenMiddleware')

router.use(checkTokenMiddleware)

// 添加订单
router.post('/create', async (req, res) => {
  try {
    const buyerId = req.user._id
    const { sellerId, productId, deliverAddress, isBlindBox, unitPrice, quantity } = req.body

    if (!productId || !sellerId || !deliverAddress || !unitPrice || !quantity) {
      return res.status(400).json({ code: 400, msg: '缺少必要参数' })
    }

    // 不能购买自己的商品
    if (String(buyerId) === String(sellerId)) {
      return res.status(400).json({ code: 400, msg: '不能购买自己的商品' })
    }

    const product = await ProductModel.findOneAndUpdate(
      { _id: productId, shopNum: { $gte: quantity } },
      { $inc: { shopNum: -quantity } },
      { returnDocument: 'after' }
    )

    if (!product) {
      return res.status(400).json({ code: 400, msg: '商品库存不足' })
    }

    const order = await OrderModel.create({
      buyerId,
      sellerId,
      productId,
      deliverAddress, 
      isBlindBox: isBlindBox || false,
      unitPrice,
      quantity,
      status: 0,
      deliverMethod: 0
    })

    if (!order) {
      await ProductModel.findByIdAndUpdate(productId, { $inc: { shopNum: quantity } })
      return res.status(400).json({ code: 400, msg: '创建订单失败' })
    }

    await NotificationModel.create({
      userId: sellerId,
      type: 'new_order',
      title: '新订单通知',
      msg: `您有一个新订单 #${order._id}，请及时处理`,
      orderId: order._id
    })

    res.json({ code: 200, data: order })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取我购买的订单
router.get('/bought', async (req, res) => {
  try {
    const userId = req.user._id
    const { page = 1, pageSize = 10, status } = req.query

    const query = { buyerId: userId }
    if (status) query.status = parseInt(status)

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [orders, total] = await Promise.all([
      OrderModel.find(query)
        .populate('productId')
        .skip(skip)
        .limit(limit)
        .sort({ orderTime: -1 }),
      OrderModel.countDocuments(query)
    ])

    // 盲盒订单隐藏商品信息
    const data = orders.map(order => {
      if (order.isBlindBox) {
        const orderObj = order.toObject()
        orderObj.productId = {
          _id: order.productId?._id || null,
          shopName: '盲盒商品',
          msg: '盲盒商品，具体信息以实际收到为准'
        }
        return orderObj
      }
      return order
    })

    res.json({
      code: 200,
      data,
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

// 获取我卖出的订单
router.get('/sold', async (req, res) => {
  try {
    const userId = req.user._id
    const { page = 1, pageSize = 10, status } = req.query

    const query = { sellerId: userId }
    if (status) query.status = parseInt(status)

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [orders, total] = await Promise.all([
      OrderModel.find(query)
        .populate('productId')
        .skip(skip)
        .limit(limit)
        .sort({ orderTime: -1 }),
      OrderModel.countDocuments(query)
    ])

    res.json({
      code: 200,
      data: orders,
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

// 获取单个订单
router.get('/OneOrd', async (req, res) => {
  try {
    const orderId = req.query.id
    const userId = req.user._id

    const order = await OrderModel.findById(orderId).populate('productId')
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }

    // 权限检查：只有买家或卖家可查看
    if (String(order.buyerId) !== String(userId) && String(order.sellerId) !== String(userId)) {
      return res.status(403).json({ code: 403, msg: '无权限查看此订单' })
    }

    res.json({ code: 200, data: order })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取盲盒订单
router.get('/blindBox', async (req, res) => {
  try {
    const userId = req.user._id
    const { page = 1, pageSize = 10, status } = req.query

    const query = { buyerId: userId, isBlindBox: true }
    if (status) query.status = parseInt(status)

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [orders, total] = await Promise.all([
      OrderModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ orderTime: -1 }),
      OrderModel.countDocuments(query)
    ])

    // 盲盒订单只返回必要字段，不暴露商品信息
    const data = orders.map(order => ({
      _id: order._id,
      status: order.status,
      unitPrice: order.unitPrice,
      isBlindBox: true,
      orderTime: order.orderTime,
      payTime: order.payTime,
      deliverAddress: order.deliverAddress,
      expireAt: order.expireAt
    }))

    res.json({
      code: 200,
      data,
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

// 修改订单状态（使用原子操作防止竞态条件）
router.put('/updateStatus', async (req, res) => {
  try {
    const { orderId, newStatus } = req.body
    const userId = req.user._id

    if (!orderId || newStatus === undefined) {
      return res.status(400).json({ code: 400, msg: '缺少必要参数' })
    }

    // 权限校验先做（不依赖订单状态，无竞态问题）
    let order = null

    if (newStatus === 1) {
      // 支付：原子操作 — 只更新 status=0 的订单，同时检查买家身份
      order = await OrderModel.findOneAndUpdate(
        { _id: orderId, status: 0, buyerId: userId },
        { status: 1, payTime: new Date(), expireAt: null },
        { new: true }
      )
      if (!order) {
        // 可能是订单不存在、状态不是0、或不是买家
        const exists = await OrderModel.findById(orderId).select('status buyerId')
        if (!exists) return res.status(404).json({ code: 404, msg: '订单不存在' })
        if (String(exists.buyerId) !== String(userId)) return res.status(403).json({ code: 403, msg: '只有买家可以付款' })
        return res.status(400).json({ code: 400, msg: '订单状态异常或已被支付' })
      }

      // 原子扣款：只在余额充足时扣减
      const total = Math.round(order.unitPrice * order.quantity * 100) / 100
      const deducted = await UserModel.findOneAndUpdate(
        { _id: userId, Balance: { $gte: total } },
        { $inc: { Balance: -total } },
        { new: true }
      )
      if (!deducted) {
        // 余额不足，回滚订单状态
        await OrderModel.findByIdAndUpdate(orderId, { status: 0, payTime: null, expireAt: null })
        return res.status(400).json({ code: 400, msg: '余额不足' })
      }

      await NotificationModel.create({
        userId: order.sellerId,
        type: 'order_paid',
        title: '订单已付款',
        msg: `订单 #${orderId} 已完成付款，请尽快发货`,
        orderId
      })

      return res.json({ code: 200, data: order })
    }

    if (newStatus === 2) {
      // 发货：原子操作 — 只更新 status=1 的订单，同时检查卖家身份
      order = await OrderModel.findOneAndUpdate(
        { _id: orderId, status: 1, sellerId: userId },
        { status: 2 },
        { new: true }
      )
      if (!order) {
        const exists = await OrderModel.findById(orderId).select('status sellerId')
        if (!exists) return res.status(404).json({ code: 404, msg: '订单不存在' })
        if (String(exists.sellerId) !== String(userId)) return res.status(403).json({ code: 403, msg: '只有卖家可以发货' })
        return res.status(400).json({ code: 400, msg: '订单状态异常，无法发货' })
      }

      await NotificationModel.create({
        userId: order.buyerId,
        type: 'order_shipped',
        title: '订单已发货',
        msg: `您的订单 #${orderId} 已发货，请注意查收`,
        orderId
      })

      return res.json({ code: 200, data: order })
    }

    if (newStatus === 3) {
      // 确认收货：原子操作 — 只更新 status=2 的订单，同时检查买家身份
      order = await OrderModel.findOneAndUpdate(
        { _id: orderId, status: 2, buyerId: userId },
        { status: 3 },
        { new: true }
      )
      if (!order) {
        const exists = await OrderModel.findById(orderId).select('status buyerId')
        if (!exists) return res.status(404).json({ code: 404, msg: '订单不存在' })
        if (String(exists.buyerId) !== String(userId)) return res.status(403).json({ code: 403, msg: '只有买家可以确认收货' })
        return res.status(400).json({ code: 400, msg: '订单状态异常，无法确认收货' })
      }

      // 钱打给卖家
      const total = Math.round(order.unitPrice * order.quantity * 100) / 100
      await UserModel.findByIdAndUpdate(order.sellerId, { $inc: { Balance: total } })

      await NotificationModel.create({
        userId: order.sellerId,
        type: 'order_paid',
        title: '订单已完成',
        msg: `订单 #${orderId} 已确认收货，款项已转入您的余额`,
        orderId
      })

      return res.json({ code: 200, data: order })
    }

    return res.status(400).json({ code: 400, msg: '无效的订单状态' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 取消订单（统一接口，买家和卖家共用）
router.post('/cancel', async (req, res) => {
  try {
    const { orderId, reason } = req.body
    const userId = req.user._id

    if (!orderId) {
      return res.status(400).json({ code: 400, msg: '缺少订单 id' })
    }

    const order = await OrderModel.findById(orderId)
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }

    // 30 秒内不能重复取消同一订单
    if (order.cancelTime && Date.now() - new Date(order.cancelTime).getTime() < 30000) {
      return res.status(429).json({ code: 429, msg: '操作太频繁，请 30 秒后再试' })
    }

    // 判断请求方身份
    const isBuyer = String(order.buyerId) === String(userId)
    const isSeller = String(order.sellerId) === String(userId)

    if (!isBuyer && !isSeller) {
      return res.status(403).json({ code: 403, msg: '无权操作此订单' })
    }

    // 盲盒订单已付款后不可取消
    if (order.isBlindBox && order.status >= 1) {
      return res.status(400).json({ code: 400, msg: '盲盒订单已付款，无法取消' })
    }

    // 如果既是买家又是卖家，优先按卖家逻辑处理
    if (isSeller) {
      if (order.status !== 0 && order.status !== 1) {
        return res.status(403).json({ code: 403, msg: '当前状态无法取消' })
      }
    } else if (isBuyer && order.status !== 0) {
      return res.status(403).json({ code: 403, msg: '订单已付款，无法取消' })
    }

    // 恢复商品库存
    await ProductModel.findByIdAndUpdate(order.productId, {
      $inc: { shopNum: order.quantity }
    })

    // 卖家取消已支付的订单 → 退款中；其余情况 → 已取消
    if (isSeller && order.status === 1) {
      order.status = 5
      const total = Math.round(order.unitPrice * order.quantity * 100) / 100
      // 钱还在平台冻结，退给买家即可
      await UserModel.findByIdAndUpdate(order.buyerId, { $inc: { Balance: total } })
    } else {
      order.status = 4
    }
    order.cancelReason = reason || ''
    order.cancelTime = new Date()
    order.cancelBy = isBuyer ? 'buyer' : 'seller'
    await order.save()

    // 卖家取消 → 通知买家
    if (isSeller) {
      await NotificationModel.create({
        userId: order.buyerId,
        type: 'order_cancelled',
        title: '订单已取消',
        msg: `卖家已取消订单 #${order._id}${reason ? '，原因：' + reason : ''}`,
        orderId: order._id
      })
    }

    // 买家取消 → 通知卖家
    if (isBuyer) {
      await NotificationModel.create({
        userId: order.sellerId,
        type: 'order_refunded',
        title: '买家取消订单',
        msg: `买家已取消订单 #${order._id}${reason ? '，原因：' + reason : ''}`,
        orderId: order._id
      })
    }

    res.json({ code: 200, data: order, msg: '订单已取消' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 买家退款（仅限非盲盒商品）
router.post('/refund', async (req, res) => {
  try {
    const { orderId, reason } = req.body
    const userId = req.user._id

    if (!orderId) {
      return res.status(400).json({ code: 400, msg: '缺少订单 id' })
    }

    const order = await OrderModel.findById(orderId)
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }

    if (String(order.buyerId) !== String(userId)) {
      return res.status(403).json({ code: 403, msg: '无权操作此订单' })
    }

    if (order.isBlindBox) {
      return res.status(400).json({ code: 400, msg: '盲盒商品不支持退款' })
    }

    if (order.status !== 1) {
      return res.status(400).json({ code: 400, msg: '当前订单状态不支持退款' })
    }

    // 30 秒内不能重复申请退款
    if (order.cancelTime && Date.now() - new Date(order.cancelTime).getTime() < 30000) {
      return res.status(429).json({ code: 429, msg: '操作太频繁，请 30 秒后再试' })
    }

    // 恢复商品库存
    await ProductModel.findByIdAndUpdate(order.productId, {
      $inc: { shopNum: order.quantity }
    })

    order.status = 5
    order.cancelReason = reason || '买家申请退款'
    order.cancelTime = new Date()
    order.cancelBy = 'buyer'
    await order.save()

    // 钱还在平台冻结，退给买家即可
    const total = Math.round(order.unitPrice * order.quantity * 100) / 100
    await UserModel.findByIdAndUpdate(order.buyerId, { $inc: { Balance: total } })

    // 退款 → 通知卖家
    await NotificationModel.create({
      userId: order.sellerId,
      type: 'order_refunded',
      title: '买家申请退款',
      msg: `买家已申请退款 #${order._id}${reason ? '，原因：' + reason : ''}`,
      orderId: order._id
    })

    res.json({ code: 200, data: order, msg: '退款申请已提交' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 更新订单收货地址（仅买家可操作）
router.put('/updateAddress', async (req, res) => {
  try {
    const { orderId, deliverAddress } = req.body
    const userId = req.user._id

    if (!orderId || !deliverAddress) {
      return res.status(400).json({ code: 400, msg: '缺少必要参数' })
    }

    const order = await OrderModel.findById(orderId)
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }

    if (String(order.buyerId) !== String(userId)) {
      return res.status(403).json({ code: 403, msg: '只有买家可以修改收货地址' })
    }

    if (order.status === 4 || order.status === 5) {
      return res.status(400).json({ code: 400, msg: '当前订单状态无法修改地址' })
    }

    const updatedOrder = await OrderModel.findByIdAndUpdate(
      orderId,
      { deliverAddress },
      { new: true }
    )

    res.json({ code: 200, data: updatedOrder })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

module.exports = router