const express = require('express')
const router = express.Router()
const OrderModel = require('../model/OrderModel')
const ProductModel = require('../model/ProductModel')
const UserModel = require('../model/UserModel')

const checkTokenMiddleware = require('../middlewares/checkTokenMiddelware')

router.use(checkTokenMiddleware)

// 添加订单
router.post('/create', async (req, res) => {
  try {
    const buyerId = req.user._id
    const { sellerId, productId, deliverAddress, isBlindBox, unitPrice, quantity } = req.body

    // 1. 先创建订单（暂不涉及库存）
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
      res.send({
        code: 400,
        msg: '创建订单失败'
      })
      return
    }

    // 2. 原子减少库存：检查库存足够并扣减
    const product = await ProductModel.findOneAndUpdate(
      { _id: productId, shopNum: { $gte: quantity } },
      { $inc: { shopNum: -quantity } },
      { new: true }
    )

    if (!product) {
      // 库存不足，删除刚创建的订单
      await OrderModel.findByIdAndDelete(order._id)
      return res.status(400).json({ code: 400, msg: '商品库存不足' })
    }
    await UserModel.findByIdAndUpdate(buyerId, 
      { $push: { ProductsBought: order._id } },
      { new: true }
    )

    res.json({ code: 200, data: order, msg: '订单创建成功' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取订单列表
router.post('/list', async (req, res) => {
  try {
    const { page = 1, pageSize = 10, role = 'buyer', status } = req.body
    const userId = req.user._id

    // 构建查询条件：根据 role 决定是买家还是卖家·
    const query = {}
    if (role === 'buyer') {
      query.buyerId = userId
    } else if (role === 'seller') {
      query.sellerId = userId
    }
    if (status) query.status = status

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [orders, total] = await Promise.all([
      OrderModel.find(query)
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

    const order = await OrderModel.findById(orderId)
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }

    // 权限检查：只有买家或卖家可查看
    if (order.buyerId !== userId && order.sellerId !== userId) {
      return res.status(403).json({ code: 403, msg: '无权限查看此订单' })
    }

    res.json({ code: 200, data: order })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 修改订单状态
router.put('/updateStatus', async (req, res) => {
  try {
    const { orderId, newStatus } = req.body
    const userId = req.user._id
    
    const order = await OrderModel.findById(orderId)
    
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }

    // 权限检查：只有买家或卖家可操作，具体逻辑视业务而定
    // 例如付款只有买家可操作，发货只有卖家可操作
    if (newStatus === 1 && order.buyerId !== userId) {
      return res.status(403).json({ code: 403, msg: '只有买家可以付款' })
    }
    if (newStatus === 2 && order.sellerId !== userId) {
      return res.status(403).json({ code: 403, msg: '只有卖家可以发货' })
    }

    // 更新状态和相关字段
    const update = { status: newStatus }
    if (newStatus === 1) {
      update.payTime = new Date()                // 记录付款时间
      update.expireAt = null                      // 取消过期删除
    }
    // 其他状态可添加相应逻辑

    const updatedOrder = await OrderModel.findByIdAndUpdate(orderId, update, { new: true })

    res.json({ code: 200, data: updatedOrder, msg: '状态更新成功' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 删除订单（取消）
router.delete('/del', async (req, res) => {
  try {
    const orderId = req.query.id
    const userId = req.user._id
    console.log(req.query)
    

    const order = await OrderModel.findById(orderId)
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }

    // 只有买家且订单状态为待付款时可取消
    if (order.buyerId !== userId || order.status !== 0) {
      return res.status(403).json({ code: 403, msg: '无法取消此订单' })
    }

    // 恢复商品库存
    await ProductModel.findByIdAndUpdate(order.productId, {
      $inc: { shopNum: order.quantity }
    })

    // 更新订单状态为已取消
    order.status = 4
    await order.save()

    res.json({ code: 200, msg: '订单已取消' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

module.exports = router