const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  UserName: {
    type: String,
    required: true, 
    unique: true   // 用户名
  },
  PhoneNumber: {
    type: Number,
    unique: true,
    required: true // 手机号
  },
  PassWord: {
    type: String,
    required: true // 密码
  },

  // 非必填
  StudentId: {
    type: String,
    default: ''  // 学号
  },
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
    default: new Date() // 创建时间
  },
  Avatar: {
    type: String,
    default: ''   // 头像
  }, 
  tokenVersion: { 
    type: Number, 
    default: 0 
  },   // 用于单点登录
  // 余额
  Balance: {
    type: Number,
    default: 0,
    set: v => Math.round(v * 100) / 100
  }
})

const UserModel = mongoose.model('user', UserSchema)

module.exports = UserModel