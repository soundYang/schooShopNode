const mongoose = require('mongoose')

const PaySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['order_payment', 'withdraw'],
    required: true
  },
  orderId: {
    type: String,
    default: ''
  },
  amount: {
    type: Number,
    required: true
  },
  outTradeNo: {
    type: String,
    default: ''
  },
  payjsOrderId: {
    type: String,
    default: ''
  },
  status: {
    type: Number,
    default: 0,
    enum: [0, 1, 2]
  },
  remark: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: () => Date.now()
  }
})

module.exports = mongoose.model('Pay', PaySchema)
