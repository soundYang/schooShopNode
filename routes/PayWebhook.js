const express = require('express')
const router = express.Router()
const md5 = require('md5')
const axios = require('axios')
const PayModel = require('../model/PayModel')
const OrderModel = require('../model/OrderModel')
const NotificationModel = require('../model/NotificationModel')
const xorpayConfig = require('../config/xorpay')

function xorpaySign(valueStr, appSecret) {
  return md5(valueStr + appSecret).toLowerCase()
}

// XorPay 支付回调（POST form-urlencoded）
router.post('/pay/notify', async (req, res) => {
  try {
    const params = req.body
    const { aoid, order_id, pay_price, pay_time, sign } = params

    if (!aoid || !order_id || !pay_price || !pay_time || !sign) {
      console.error('XorPay 回调参数不完整', params)
      return res.status(200).send('fail')
    }

    const signStr = aoid + order_id + pay_price + pay_time
    const expectedSign = xorpaySign(signStr, xorpayConfig.appSecret)

    if (expectedSign !== sign) {
      console.error('XorPay 回调签名验证失败', params)
      return res.status(200).send('fail')
    }

    const pay = await PayModel.findOne({ outTradeNo: order_id })
    if (!pay) {
      console.error('XorPay 回调：支付记录不存在', order_id)
      return res.status(200).send('fail')
    }

    if (pay.status === 1) {
      return res.status(200).send('success')
    }

    pay.status = 1
    pay.payjsOrderId = aoid
    pay.payTime = new Date(pay_time)
    await pay.save()

    if (pay.type === 'order_payment' && pay.orderId) {
      const order = await OrderModel.findById(pay.orderId)
      if (!order) {
        console.error('XorPay 回调：订单不存在', pay.orderId)
        return res.status(200).send('success')
      }

      if (order.status !== 0) {
        return res.status(200).send('success')
      }

      order.status = 1
      order.payTime = pay.payTime
      order.expireAt = null
      await order.save()

      await NotificationModel.create({
        userId: order.sellerId,
        type: 'order_paid',
        title: '订单已付款',
        msg: `订单 #${pay.orderId} 已完成微信支付，请尽快发货`,
        orderId: pay.orderId
      })
    }

    res.status(200).send('success')
  } catch (err) {
    console.error('XorPay 回调处理异常', err)
    res.status(200).send('fail')
  }
})

// XorPay 订单查询（用于主动轮询兜底）
router.post('/pay/query', async (req, res) => {
  try {
    const { order_id } = req.body

    if (!order_id) {
      return res.status(400).json({ code: 400, msg: '缺少 order_id' })
    }

    const sign = xorpaySign(order_id, xorpayConfig.appSecret)

    const response = await axios.get(
      xorpayConfig.api.query + '/' + xorpayConfig.appid,
      {
        params: { order_id, sign }
      }
    )

    const result = response.data

    const statusMap = {
      'not_exist': 0,
      'new': 0,
      'payed': 1,
      'fee_error': 1,
      'success': 1,
      'expire': 0
    }

    res.json({
      code: 200,
      data: {
        order_id,
        xorpay_status: result.status,
        status: statusMap[result.status] || 0
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '查询失败' })
  }
})

module.exports = router
