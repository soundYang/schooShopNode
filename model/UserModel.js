const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  UserName: {
    type: String,
    required: true // 用户名
  },
  PhoneNumber: {
    type: Number,
    required: true // 手机号
  },
  PassWord: {
    type: String,
    required: true // 密码
  },
  StudentId: {
    type: String,
    required: true  // 学号
  },

  // 非必填
  Addresses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address'   // 地址
  }],
  defaultAddress: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address',   // 默认地址
    default: null   // 添加默认值
  },
  CreatedTime: {
    type: Date,
    default: Date.now // 创建时间
  },
  Avatar: {
    type: String,
    default: ''   // 头像
  }, 
  SellerReview: {
    type: Array,
    default: []   // 卖家评价
  },
  TotalSold: {
    type: Number,
    default: 0   // 总售出
  },
  ProductsPosted: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'  // 售出商品
  }],
  ProductsBought: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'// 购入商品
  }],
})

const UserModel = mongoose.model('user', UserSchema)

module.exports = UserModel