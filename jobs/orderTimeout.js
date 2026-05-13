const OrderModel = require('../model/OrderModel')
const ProductModel = require('../model/ProductModel')

const CHECK_INTERVAL = 30 * 1000
const ORDER_TTL = 30 * 60 * 1000

async function processExpiredOrders() {
  try {
    const now = new Date()
    const expireThreshold = new Date(now.getTime() - ORDER_TTL)

    const expiredOrders = await OrderModel.find({
      status: 0,
      isBlindBox: { $ne: true },
      orderTime: { $lte: expireThreshold }
    })

    if (expiredOrders.length === 0) return

    for (const order of expiredOrders) {
      try {
        await ProductModel.findByIdAndUpdate(order.productId, {
          $inc: { shopNum: order.quantity }
        })

        await ProductModel.findOneAndUpdate(
          { _id: order.productId, shopNum: { $gt: 0 }, shopStatus: 2 },
          { shopStatus: 0 }
        )

        order.status = 4
        order.cancelReason = '订单超时未支付，系统自动取消'
        order.cancelTime = new Date()
        order.cancelBy = ''
        await order.save()

        console.log(`订单超时自动取消: ${order._id}，已还原商品 ${order.productId} 库存 ${order.quantity}`)
      } catch (err) {
        console.error(`处理超时订单 ${order._id} 失败:`, err)
      }
    }
  } catch (err) {
    console.error('订单超时检查失败:', err)
  }
}

if (!process.env.pm_id || process.env.pm_id === '0') {
  setInterval(processExpiredOrders, CHECK_INTERVAL)
  console.log('订单超时自动取消任务已启动')
}
