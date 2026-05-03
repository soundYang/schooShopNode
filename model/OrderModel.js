const mongoose = require('mongoose')

const OrderSchema = new mongoose.Schema({
  buyerId:{
    type: String,
    required: true
  },
  sellerId:{
    type: String,
    required: true
  },
  productId:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity:{
    type: Number,
    required: true  // 购买数量
  },
  /**
   * 订单状态：
   * 0待付款，
   * 1已付款待发货，
   * 2已发货待收货，
   * 3已完成，
   * 4已取消 
   * 5退款中
   */
  status:{
    type: Number,
    default: 0,  
    enum: [0,1,2,3,4,5],
    required: true  // 订单状态
  },
  /**
   * 配送方式：
   * 暂时仅支持平台方配送
   * 
   * 0，默平台方提供拿货配送人员
   * 
   */
  deliverMethod:{
    type: Number,
    default: 0,
    enum: [0],
    required: true  // 配送方式
  },
  deliverAddress:{
    type: String,
    default: ''
  },
  isBlindBox:{
    type: Boolean,
    default: false,
    required: true  // 是否为盲盒
  },
  unitPrice:{
    type: Number,
    required: true  // 单价
  },
  payTime:{
    type: Date,  // 付款时间
  },
  orderTime:{
    type: Date,
    default: Date.now  // 订单时间
  },
  expireAt: {
    type: Date,
    default: function() {
      return this.isBlindBox ? null : new Date(Date.now() + 30 * 60 * 1000)
    }
  },
  cancelReason: {
    type: String,
    default: ''
  },
  cancelTime: {
    type: Date
  },
  cancelBy: {
    type: String,
    enum: ['buyer', 'seller', ''],
    default: ''
  }
})

// 虚拟字段：剩余付款时间（毫秒）
OrderSchema.virtual('remainTime').get(function() {
  if (this.status !== 0) return 0
  // 盲盒订单永不过期（前端用于判断是否显示"已超时"）
  if (this.isBlindBox) return -1
  const now = new Date()
  const expireTime = this.orderTime.getTime() + 30 * 60 * 1000
  const remaining = expireTime - now
  return remaining > 0 ? remaining : 0
})

// 设置 TTL 索引（可选）：自动删除过期未付款的订单（排除盲盒订单）
OrderSchema.index(
    { expireAt: 1 },
    {
        expireAfterSeconds: 0,
        partialFilterExpression: { isBlindBox: { $ne: true } }
    }
)

OrderSchema.index({ buyerId: 1, status: 1, orderTime: -1 })
OrderSchema.index({ sellerId: 1, status: 1, orderTime: -1 })
OrderSchema.index({ productId: 1 })

// 确保虚拟字段在 JSON 输出中包含
OrderSchema.set('toJSON', { virtuals: true })
OrderSchema.set('toObject', { virtuals: true })

const OrderModel = mongoose.model('Order', OrderSchema)

/**
 * 这里自动删除订单，Order里面的订单的确删除，但是User里面关联的并未删除
 * 采取下面优化就没必要上述的
 * 
 * 后续优化
 * 将User里面的评价，售出和购入的商品取消关联，以及订单，靠数据库查询来获取。
 */

module.exports = OrderModel