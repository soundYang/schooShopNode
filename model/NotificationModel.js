const mongoose = require('mongoose')

const NotificationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['new_order', 'order_paid', 'order_shipped', 'order_cancelled', 'order_refunded', 'new_review'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  msg: {
    type: String,
    required: true
  },
  orderId: {
    type: String
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
})

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 })

module.exports = mongoose.model('Notification', NotificationSchema)
