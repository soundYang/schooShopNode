const mongoose = require('mongoose')

const LogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['login', 'register', 'admin', 'operation', 'error', 'system'],
    required: true,
    index: true
  },
  level: {
    type: String,
    enum: ['info', 'warn', 'error'],
    default: 'info',
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    default: null,
    index: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
    index: true
  },
  username: {
    type: String,
    default: ''
  },
  action: {
    type: String,
    default: ''
  },
  target: {
    type: String,
    default: ''
  },
  targetId: {
    type: String,
    default: ''
  },
  detail: {
    type: String,
    default: ''
  },
  ip: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    default: 'success'
  },
  duration: {
    type: Number,
    default: 0
  },
  path: {
    type: String,
    default: ''
  },
  method: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
})

LogSchema.index({ createdAt: -1 })
LogSchema.index({ type: 1, createdAt: -1 })

module.exports = mongoose.model('Log', LogSchema, 'logs')
