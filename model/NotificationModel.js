const mongoose = require('mongoose')

const NotificationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
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
  message: {
    type: String,
    required: true
  },
  orderId: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
})

module.exports = mongoose.model('Notification', NotificationSchema)
