const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  UserName: {
    type: String,
    required: true // 用户名
  },
  PhoneNumber: {
    type: String,
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
  CreatedTime: {
    type: Date,
    default: Date.now // 创建时间
  },
  Address:{
    type: Array,
    default: []  // 地址
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
  ProductsPosted: {
    type: Array,
    default: []   // 售出商品
  },
  ProductsBought: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'product'// 购入商品
  },
})

const UserModel = mongoose.model('user', UserSchema)

module.exports = UserModel