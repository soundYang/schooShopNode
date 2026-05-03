const express = require('express')
const router = express.Router()
const axios = require('axios')
const md5 = require('md5')
const PayModel = require('../model/PayModel')
const OrderModel = require('../model/OrderModel')
const UserModel = require('../model/UserModel')
const xorpayConfig = require('../config/xorpay')
const checkTokenMiddleware = require('../middlewares/checkTokenMiddleware')

function generateOutTradeNo() {
  const now = Date.now()
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `SHOP${now}${rand}`
}

function xorpaySign(valueStr, appSecret) {
  return md5(valueStr + appSecret).toLowerCase()
}

router.use(checkTokenMiddleware)

// 订单支付 — 生成微信支付二维码
router.post('/order', async (req, res) => {
  try {
    const userId = req.user._id
    const { orderId } = req.body

    if (!orderId) {
      return res.status(400).json({ code: 400, msg: '缺少订单ID' })
    }

    const order = await OrderModel.findById(orderId)
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }
    if (String(order.buyerId) !== String(userId)) {
      return res.status(403).json({ code: 403, msg: '无权操作此订单' })
    }
    if (order.status !== 0) {
      return res.status(400).json({ code: 400, msg: '当前订单状态不支持支付' })
    }

    const total = (Math.round(order.unitPrice * order.quantity * 100) / 100).toFixed(2)
    const outTradeNo = generateOutTradeNo()
    const name = order.productId?.shopName || '商品购买'

    const signStr = name + 'native' + total + outTradeNo + xorpayConfig.notifyUrl
    const sign = xorpaySign(signStr, xorpayConfig.appSecret)

    const response = await axios.post(
      xorpayConfig.api.pay + '/' + xorpayConfig.appid,
      {
        name,
        pay_type: 'native',
        price: total,
        order_id: outTradeNo,
        notify_url: xorpayConfig.notifyUrl,
        sign
      },
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    )

    const result = response.data

    if (result.status !== 'ok') {
      return res.status(500).json({ code: 500, msg: '生成支付二维码失败: ' + result.status })
    }

    await PayModel.create({
      userId,
      type: 'order_payment',
      orderId,
      amount: parseFloat(total),
      outTradeNo,
      payjsOrderId: result.aoid,
      status: 0
    })

    res.json({
      code: 200,
      data: {
        codeUrl: result.info.qr,
        xorpayOrderId: result.aoid,
        outTradeNo,
        expireIn: result.expires_in || 7200
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 卖家提现 — 提交提现申请
router.post('/withdraw', async (req, res) => {
  try {
    const userId = req.user._id
    const { amount } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ code: 400, msg: '提现金额必须大于0' })
    }

    if (amount < 1) {
      return res.status(400).json({ code: 400, msg: '最低提现金额为1元' })
    }

    const user = await UserModel.findById(userId)
    if (!user || user.Balance < amount) {
      return res.status(400).json({ code: 400, msg: '余额不足' })
    }

    const outTradeNo = generateOutTradeNo()

    await UserModel.findByIdAndUpdate(userId, { $inc: { Balance: -amount } })

    await PayModel.create({
      userId,
      type: 'withdraw',
      amount,
      outTradeNo,
      status: 0,
      remark: '提现申请已提交，等待平台处理'
    })

    res.json({ code: 200, msg: '提现申请已提交，平台处理完成后会将款项转到您的微信' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 查询支付状态
router.get('/status/:outTradeNo', async (req, res) => {
  try {
    const userId = req.user._id
    const { outTradeNo } = req.params

    const pay = await PayModel.findOne({ outTradeNo })
    if (!pay) {
      return res.status(404).json({ code: 404, msg: '支付记录不存在' })
    }
    if (String(pay.userId) !== String(userId)) {
      return res.status(403).json({ code: 403, msg: '无权查看' })
    }

    res.json({
      code: 200,
      data: {
        outTradeNo: pay.outTradeNo,
        type: pay.type,
        status: pay.status,
        amount: pay.amount,
        payTime: pay.createdAt
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 查询用户的支付/提现记录
router.get('/records', async (req, res) => {
  try {
    const userId = req.user._id
    const { page = 1, pageSize = 20 } = req.query

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [records, total] = await Promise.all([
      PayModel.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PayModel.countDocuments({ userId })
    ])

    res.json({
      code: 200,
      data: records,
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
