const mongoose = require('mongoose')

const AddressSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true  // 用户id
  },
  receiver: { 
    type: String, 
    required: true  // 收货人
  },   
  phone: { 
    type: String, 
    required: true  // 联系电话
  },      
  detail: { 
    type: String, 
    required: true  // 详细地址
  },      
  isDefault: { 
    type: Boolean, 
    default: false  // 是否默认
  },  
  createdAt: { 
    type: Date, 
    default: new Date()  // 创建时间
  }   
})

module.exports = mongoose.model('Address', AddressSchema)