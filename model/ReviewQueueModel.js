const mongoose = require('mongoose')

const ReviewQueueSchema = new mongoose.Schema({
  targetType: {
    type: String,
    enum: ['product', 'review'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  images: [{
    type: String
  }],
  violationType: {
    type: String,
    enum: ['image', 'text', 'other'],
    default: 'other'
  },
  reason: {
    type: String,
    default: ''
  },
  hitWords: [{
    type: String
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  submittedBy: {
    type: String,
    required: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  reviewedAt: {
    type: Date
  },
  rejectReason: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
})

ReviewQueueSchema.index({ status: 1, createdAt: -1 })
ReviewQueueSchema.index({ targetType: 1, targetId: 1 })

module.exports = mongoose.model('ReviewQueue', ReviewQueueSchema, 'reviewQueue')
