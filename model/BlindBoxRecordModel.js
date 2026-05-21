// model/BlindBoxRecordModel.js
const mongoose = require('mongoose')

const blindBoxRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  date: { type: String, required: true },
  boxes: [
    {
      randomPrice: { type: Number, required: true },
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      productSnapshot: {
        name: String,
        images: [String],
        actualValue: Number,
        msg: String,
        label: { type: String, default: '' }   // 第一个标签
      },
      status: { type: Number, enum: [0, 1], default: 0 },
      isRevealed: { type: Boolean, default: false },
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
      createdAt: { type: Date, default: Date.now },
      purchasedAt: Date
    }
  ]
})

blindBoxRecordSchema.index({ userId: 1, date: 1 }, { unique: true })
module.exports = mongoose.model('BlindBoxRecord', blindBoxRecordSchema)