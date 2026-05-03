const mongoose = require('mongoose')

const ReviewSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: true  // 用户名
  },
  userId: {
    type: String,
    required: true  // 用户id
  },
  sellerId: {
    type: String,
    required: true  // 卖家id
  },
  productId: {
    type: String,
    required: true  // 商品id
  },
  orderId: {
    type: String,
    required: true  // 订单id
  },
  content: {
    type: String,
    required: true  // 评论内容
  },
  proPhoto:{
    type: String,
    default: ''     // 商品图片
  },
  Avatar:{
    type: String,
    default: ''    // 用户头像
  },
  time:{
    type: Date,
    default: Date.now
  }
})

const Review = mongoose.model('Review', ReviewSchema)

module.exports = Review