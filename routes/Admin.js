const express = require('express')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { secret } = require('../config/index.js')
const AdminModel = require('../model/AdminModel.js')
const UserModel = require('../model/UserModel.js')
const ProductModel = require('../model/ProductModel.js')
const OrderModel = require('../model/OrderModel.js')
const ReviewModel = require('../model/ReviewModel.js');
const ReviewQueueModel = require('../model/ReviewQueueModel.js');
const LabelModel = require('../model/LabelModel.js')
const BlindBoxRecordModel = require('../model/BlindBoxRecordModel.js')
const NotificationModel = require('../model/NotificationModel.js')
const checkAdminMiddleware = require('../middlewares/checkAdminMiddleware.js')
const logService = require('../ToolFunction/logService')
const router = express.Router()

// ==================== 登录 ====================

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ code: 400, msg: '请输入用户名和密码' })
    }

    const admin = await AdminModel.findOne({ username })
    if (!admin) {
      return res.status(401).json({ code: 401, msg: '管理员不存在' })
    }
    if (!admin.status) {
      return res.status(403).json({ code: 403, msg: '管理员账号已禁用' })
    }

    const isMatch = await bcrypt.compare(password, admin.password)
    if (!isMatch) {
      return res.status(401).json({ code: 401, msg: '密码错误' })
    }

    const token = jwt.sign(
      { _id: admin._id, username: admin.username, version: admin.tokenVersion },
      secret,
      { expiresIn: '24h' }
    )

    admin.lastLogin = new Date()
    await admin.save()

    logService.admin(admin._id, admin.username, '登录后台', '管理员登录系统', req.ip)

    res.json({
      code: 200,
      data: { token, nickname: admin.nickname, role: admin.role }
    })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// ==================== 种子管理员（首次部署用） ====================

router.post('/seed', async (req, res) => {
  try {
    // 生产环境下禁止使用 seed 接口
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ code: 403, msg: '生产环境不允许使用此接口' })
    }
    const existing = await AdminModel.findOne({ username: 'admin' })
    if (existing) {
      return res.json({ code: 400, msg: '初始管理员已存在' })
    }
    const hash = await bcrypt.hash('REDACTED_DEFAULT_PASSWORD', 10)
    const admin = new AdminModel({
      username: 'admin',
      password: hash,
      nickname: '超级管理员',
      role: 'superadmin'
    })
    await admin.save()
    // 不返回明文密码
    logService.admin(admin._id, admin.username, '创建初始管理员', '首次部署创建管理员账号', req.ip)
    res.json({ code: 200, msg: '初始管理员创建成功，请使用 admin / REDACTED_DEFAULT_PASSWORD 登录' })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 以下接口需登录 ====================
router.use(checkAdminMiddleware)

// ==================== 数据概览 ====================

router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [userCount, productCount, orderCount, todayOrderCount, pendingReviewCount, lowStockCount, orders] = await Promise.all([
      UserModel.countDocuments({}),
      ProductModel.countDocuments({}),
      OrderModel.countDocuments({}),
      OrderModel.countDocuments({ orderTime: { $gte: today } }),
      ReviewModel.countDocuments({}),
      ProductModel.countDocuments({ shopNum: { $lte: 1 }, shopStatus: 0 }),
      OrderModel.aggregate([
        { $match: { status: { $in: [1, 2, 3] } } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$unitPrice', '$quantity'] } } } }
      ])
    ])

    const totalRevenue = orders.length > 0 ? orders[0].total : 0

    res.json({
      code: 200,
      data: { userCount, productCount, orderCount, todayOrderCount, totalRevenue, pendingReviewCount, lowStockCount }
    })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 用户管理 ====================

router.get('/users', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, status } = req.query
    const query = {}

    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escaped, 'i')
      query.$or = [
        { UserName: regex },
        { PhoneNumber: isNaN(Number(keyword)) ? undefined : Number(keyword) },
        { StudentId: regex }
      ].filter(Boolean)
    }
    if (status !== undefined && status !== '') {
      query.status = Number(status)
    }

    const [list, total] = await Promise.all([
      UserModel.find(query)
        .sort({ CreatedTime: -1 })
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .select('-PassWord'),
      UserModel.countDocuments(query)
    ])

    res.json({ code: 200, data: { list, total } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.put('/users/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { status: Number(status) },
      { new: true }
    ).select('-PassWord')

    if (!user) {
      return res.status(404).json({ code: 404, msg: '用户不存在' })
    }

    const actionText = status === 0 ? '封禁用户' : '解封用户'
    logService.admin(req.admin._id, req.admin.username, actionText, `用户ID: ${req.params.id}, 用户名: ${user.UserName}`, req.ip)

    res.json({ code: 200, msg: status === 0 ? '用户已封禁' : '用户已解封', data: user })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.get('/users/:id', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id).select('-PassWord')
    if (!user) {
      return res.status(404).json({ code: 404, msg: '用户不存在' })
    }

    const [orderCount, reviewCount] = await Promise.all([
      OrderModel.countDocuments({ buyerId: req.params.id }),
      ReviewModel.countDocuments({ userId: req.params.id })
    ])

    res.json({ code: 200, data: { ...user.toObject(), orderCount, reviewCount } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 商品管理 ====================

router.get('/products', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, status, isBlindBox, label } = req.query
    const query = {}

    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.shopName = new RegExp(escaped, 'i')
    }
    if (status !== undefined && status !== '') {
      query.shopStatus = Number(status)
    }
    if (isBlindBox !== undefined && isBlindBox !== '') {
      query.isBlindBox = isBlindBox === 'true'
    }
    if (label) {
      query.shopLabel = label
    }

    const [list, total] = await Promise.all([
      ProductModel.find(query)
        .sort({ createTime: -1 })
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize)),
      ProductModel.countDocuments(query)
    ])

    res.json({ code: 200, data: { list, total } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.put('/products/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const product = await ProductModel.findByIdAndUpdate(
      req.params.id,
      { shopStatus: Number(status) },
      { new: true }
    )

    if (!product) {
      return res.status(404).json({ code: 404, msg: '商品不存在' })
    }
    const statusMap = { 0: '已上架', 1: '已售罄', 2: '已下架', 3: '已删除' }
    logService.admin(req.admin._id, req.admin.username, '修改商品状态', `商品ID: ${req.params.id}, 商品名: ${product.shopName}, 状态: ${statusMap[status] || status}`, req.ip)
    res.json({ code: 200, msg: `商品${statusMap[status] || '状态已更新'}`, data: product })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.delete('/products/:id', async (req, res) => {
  try {
    const product = await ProductModel.findByIdAndDelete(req.params.id)
    if (!product) {
      return res.status(404).json({ code: 404, msg: '商品不存在' })
    }
    logService.admin(req.admin._id, req.admin.username, '删除商品', `商品ID: ${req.params.id}, 商品名: ${product.shopName}`, req.ip)
    res.json({ code: 200, msg: '商品已删除' })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 订单管理 ====================

router.get('/orders', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, keyword, startDate, endDate } = req.query
    const query = {}

    if (status !== undefined && status !== '') {
      query.status = Number(status)
    }
    if (startDate || endDate) {
      query.orderTime = {}
      if (startDate) query.orderTime.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        query.orderTime.$lte = end
      }
    }
    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.$or = [
        { _id: mongoose.Types.ObjectId.isValid(keyword) ? keyword : null },
        { buyerId: mongoose.Types.ObjectId.isValid(keyword) ? keyword : null },
        { sellerId: mongoose.Types.ObjectId.isValid(keyword) ? keyword : null }
      ].filter(Boolean)
      if (query.$or.length === 0) delete query.$or
    }

    const [list, total] = await Promise.all([
      OrderModel.find(query)
        .sort({ orderTime: -1 })
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize)),
      OrderModel.countDocuments(query)
    ])

    // 填充买家/卖家/商品信息
    const populated = await OrderModel.populate(list, [
      { path: 'productId', select: 'shopName shopImg' }
    ])

    const userIds = new Set()
    populated.forEach(o => { userIds.add(o.buyerId); userIds.add(o.sellerId) })
    const users = await UserModel.find({ _id: { $in: [...userIds] } }).select('UserName')
    const userMap = {}
    users.forEach(u => { userMap[u._id.toString()] = u.UserName })

    const enriched = populated.map(o => ({
      ...o.toObject(),
      buyerName: userMap[o.buyerId] || '未知',
      sellerName: userMap[o.sellerId] || '未知'
    }))

    res.json({ code: 200, data: { list: enriched, total } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.get('/orders/:id', async (req, res) => {
  try {
    const order = await OrderModel.findById(req.params.id).populate('productId', 'shopName shopImg shopMsg')
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }

    const [buyer, seller] = await Promise.all([
      UserModel.findById(order.buyerId).select('UserName PhoneNumber'),
      UserModel.findById(order.sellerId).select('UserName PhoneNumber')
    ])

    res.json({
      code: 200,
      data: {
        ...order.toObject(),
        buyer: buyer ? { UserName: buyer.UserName, PhoneNumber: buyer.PhoneNumber } : null,
        seller: seller ? { UserName: seller.UserName, PhoneNumber: seller.PhoneNumber } : null
      }
    })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.put('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const newStatus = Number(status)

    const order = await OrderModel.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ code: 404, msg: '订单不存在' })
    }
    if (order.status === newStatus) {
      return res.json({ code: 200, msg: '订单状态已更新', data: order })
    }

    const updateData = { status: newStatus }
    if (newStatus === 1 && order.status === 0) updateData.payTime = new Date()
    if (newStatus === 4) updateData.cancelTime = new Date()

    const statusLabels = { 0: '待支付', 1: '已支付', 2: '已发货', 3: '已收货', 4: '已取消', 5: '退款中' }
    const updated = await OrderModel.findByIdAndUpdate(req.params.id, updateData, { new: true })
    logService.admin(req.admin._id, req.admin.username, '修改订单状态', `订单ID: ${req.params.id}, 状态: ${statusLabels[order.status]} → ${statusLabels[newStatus]}`, req.ip)
    res.json({ code: 200, msg: '订单状态已更新', data: updated })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 评价管理 ====================

router.get('/reviews', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query
    const query = {}

    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.content = new RegExp(escaped, 'i')
    }

    const [list, total] = await Promise.all([
      ReviewModel.find(query)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize)),
      ReviewModel.countDocuments(query)
    ])

    const populated = await ReviewModel.populate(list, { path: 'productId', select: 'shopName' })
    const userIds = [...new Set(populated.map(r => r.userId?.toString()).filter(Boolean))]
    const users = await UserModel.find({ _id: { $in: userIds } }).select('UserName Avatar')
    const userMap = {}
    users.forEach(u => { userMap[u._id.toString()] = { UserName: u.UserName, Avatar: u.Avatar } })

    const enriched = populated.map(r => ({
      ...r.toObject(),
      userInfo: userMap[r.userId?.toString()] || { UserName: '未知', Avatar: '' }
    }))

    res.json({ code: 200, data: { list: enriched, total } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.delete('/reviews/:id', async (req, res) => {
  try {
    const review = await ReviewModel.findByIdAndDelete(req.params.id)
    if (!review) {
      return res.status(404).json({ code: 404, msg: '评价不存在' })
    }
    logService.admin(req.admin._id, req.admin.username, '删除评价', `评价ID: ${req.params.id}, 内容: ${(review.content || '').substring(0, 50)}`, req.ip)
    res.json({ code: 200, msg: '评价已删除' })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 标签管理 ====================

function normalizeLabel(label) {
  if (!label) return { name: '', items: [] }
  if (typeof label === 'string') {
    try { label = JSON.parse(label) } catch { return { name: '', items: [] } }
  }
  if (Array.isArray(label)) {
    if (label.length === 1 && label[0] && typeof label[0] === 'object' && Array.isArray(label[0].items)) {
      return label[0]
    }
    return { name: '', items: label }
  }
  if (Array.isArray(label.items)) return label
  return { name: label.name || '', items: [] }
}

router.get('/labels', async (req, res) => {
  try {
    const labels = await LabelModel.findOne().sort({ _id: -1 })
    if (!labels) {
      return res.json({ code: 200, data: { mainLabel: { name: '主标签', items: [] }, attributeLabel: { name: '属性标签', items: [] }, hotLabel: { name: '热门标签', items: [] } } })
    }
    res.json({
      code: 200,
      data: {
        mainLabel: normalizeLabel(labels.mainLabel),
        attributeLabel: normalizeLabel(labels.attributeLabel),
        hotLabel: normalizeLabel(labels.hotLabel)
      }
    })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.put('/labels', async (req, res) => {
  try {
    let { mainLabel, attributeLabel, hotLabel } = req.body
    let labels = await LabelModel.findOne().sort({ _id: -1 })
    if (labels) {
      if (mainLabel) labels.mainLabel = normalizeLabel(mainLabel)
      if (attributeLabel) labels.attributeLabel = normalizeLabel(attributeLabel)
      if (hotLabel) labels.hotLabel = normalizeLabel(hotLabel)
      await labels.save()
    } else {
      labels = new LabelModel({
        mainLabel: mainLabel ? normalizeLabel(mainLabel) : { name: '主标签', items: [] },
        attributeLabel: attributeLabel ? normalizeLabel(attributeLabel) : { name: '属性标签', items: [] },
        hotLabel: hotLabel ? normalizeLabel(hotLabel) : { name: '热门标签', items: [] }
      })
      await labels.save()
    }
    logService.admin(req.admin._id, req.admin.username, '更新标签', `主标签: ${labels.mainLabel.items.length}个, 属性标签: ${labels.attributeLabel.items.length}个, 热门标签: ${labels.hotLabel.items.length}个`, req.ip)
    res.json({ code: 200, msg: '标签已更新', data: labels })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 盲盒管理 ====================

router.get('/blindbox/records', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, startDate, endDate } = req.query
    const query = {}

    if (startDate || endDate) {
      query.date = {}
      if (startDate) query.date.$gte = startDate
      if (endDate) query.date.$lte = endDate
    }

    const [list, total] = await Promise.all([
      BlindBoxRecordModel.find(query)
        .sort({ date: -1 })
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .populate('userId', 'UserName'),
      BlindBoxRecordModel.countDocuments(query)
    ])

    res.json({ code: 200, data: { list, total } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.get('/blindbox/stats', async (req, res) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    const [todayRecords, allSold] = await Promise.all([
      BlindBoxRecordModel.find({ date: todayStr }),
      BlindBoxRecordModel.aggregate([
        { $unwind: '$boxes' },
        { $match: { 'boxes.status': 1 } },
        { $group: { _id: null, total: { $sum: '$boxes.randomPrice' }, count: { $sum: 1 } } }
      ])
    ])

    let todayOpenCount = 0
    let todayBuyCount = 0
    todayRecords.forEach(record => {
      record.boxes.forEach(box => {
        if (box.isRevealed) todayOpenCount++
        if (box.status === 1) todayBuyCount++
      })
    })

    const totalRevenue = allSold.length > 0 ? allSold[0].total : 0
    const soldCount = allSold.length > 0 ? allSold[0].count : 0
    const avgPrice = soldCount > 0 ? Math.round((totalRevenue / soldCount) * 100) / 100 : 0

    res.json({
      code: 200,
      data: { todayOpenCount, todayBuyCount, totalRevenue, avgPrice }
    })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 通知管理 ====================

router.post('/notifications', async (req, res) => {
  try {
    const { userId, title, message } = req.body
    if (!title || !message) {
      return res.status(400).json({ code: 400, msg: '标题和内容不能为空' })
    }

    if (userId === 'all') {
      const users = await UserModel.find({}, '_id')
      const notifications = users.map(u => ({
        userId: u._id,
        type: 'new_order',
        title,
        msg: message,
        isRead: false
      }))
      await NotificationModel.insertMany(notifications)
      return res.json({ code: 200, msg: `已向 ${users.length} 名用户发送通知` })
    }

    const notification = new NotificationModel({
      userId,
      type: 'new_order',
      title,
      msg: message,
      isRead: false
    })
    await notification.save()
    res.json({ code: 200, msg: '通知已发送', data: notification })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.post('/notifications/batch', async (req, res) => {
  try {
    const { userIds, title, message } = req.body
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ code: 400, msg: '请指定接收用户' })
    }
    if (!title || !message) {
      return res.status(400).json({ code: 400, msg: '标题和内容不能为空' })
    }

    const notifications = userIds.map(id => ({
      userId: id,
      type: 'new_order',
      title,
      msg: message,
      isRead: false
    }))
    await NotificationModel.insertMany(notifications)
    res.json({ code: 200, msg: `已向 ${userIds.length} 名用户发送通知` })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.get('/notifications', async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query

    const [list, total] = await Promise.all([
      NotificationModel.find()
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize)),
      NotificationModel.countDocuments()
    ])

    res.json({ code: 200, data: { list, total } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 管理员管理（仅 superadmin） ====================

router.get('/admins', async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ code: 403, msg: '权限不足' })
    }
    const admins = await AdminModel.find().select('-password')
    res.json({ code: 200, data: admins })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.post('/admins', async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ code: 403, msg: '权限不足' })
    }
    const { username, password, nickname, role } = req.body
    if (!username || !password) {
      return res.status(400).json({ code: 400, msg: '用户名和密码不能为空' })
    }

    const existing = await AdminModel.findOne({ username })
    if (existing) {
      return res.status(400).json({ code: 400, msg: '用户名已存在' })
    }

    const hash = await bcrypt.hash(password, 10)
    const admin = new AdminModel({ username, password: hash, nickname, role })
    await admin.save()
    res.json({ code: 200, msg: '管理员创建成功', data: { _id: admin._id, username: admin.username, nickname: admin.nickname, role: admin.role } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.put('/admins/:id', async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ code: 403, msg: '权限不足' })
    }
    const { nickname, role, status } = req.body
    const updateData = {}
    if (nickname !== undefined) updateData.nickname = nickname
    if (role !== undefined) updateData.role = role
    if (status !== undefined) updateData.status = status

    const admin = await AdminModel.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password')
    if (!admin) {
      return res.status(404).json({ code: 404, msg: '管理员不存在' })
    }
    res.json({ code: 200, msg: '管理员信息已更新', data: admin })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// ==================== 个人信息 ====================

router.put('/profile', checkAdminMiddleware, async (req, res) => {
  try {
    const { nickname, password, oldPassword } = req.body

    // 如果修改密码，必须验证旧密码
    if (password) {
      if (!oldPassword) {
        return res.status(400).json({ code: 400, msg: '修改密码需提供旧密码' })
      }
      const admin = await AdminModel.findById(req.admin._id)
      if (!admin || !(await bcrypt.compare(oldPassword, admin.password))) {
        return res.status(400).json({ code: 400, msg: '旧密码错误' })
      }
    }

    const updateData = {}
    if (nickname) updateData.nickname = nickname
    if (password) updateData.password = await bcrypt.hash(password, 10)

    const updatedAdmin = await AdminModel.findByIdAndUpdate(req.admin._id, updateData, { new: true }).select('-password')

    if (password) {
      logService.admin(req.admin._id, req.admin.username, '修改密码', '管理员修改了自己的登录密码', req.ip)
    }
    if (nickname) {
      logService.admin(req.admin._id, req.admin.username, '修改昵称', `昵称变更为: ${nickname}`, req.ip)
    }

    res.json({ code: 200, msg: '个人信息已更新', data: updatedAdmin })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// ==================== 审核队列管理 ====================

router.get('/review-queue', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, targetType } = req.query
    const query = {}

    if (status) query.status = status
    if (targetType) query.targetType = targetType

    const [list, total] = await Promise.all([
      ReviewQueueModel.find(query)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize)),
      ReviewQueueModel.countDocuments(query)
    ])

    const enriched = await Promise.all(list.map(async (item) => {
      const obj = item.toObject()
      if (item.targetType === 'product') {
        const product = await ProductModel.findById(item.targetId).select('shopName shopPrice shopStatus')
        obj.targetInfo = product || null
      } else if (item.targetType === 'review') {
        const review = await ReviewModel.findById(item.targetId).select('content userName')
        obj.targetInfo = review || null
      }
      return obj
    }))

    res.json({ code: 200, data: { list: enriched, total } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.get('/review-queue/stats', async (req, res) => {
  try {
    const [pending, approved, rejected] = await Promise.all([
      ReviewQueueModel.countDocuments({ status: 'pending' }),
      ReviewQueueModel.countDocuments({ status: 'approved' }),
      ReviewQueueModel.countDocuments({ status: 'rejected' })
    ])

    res.json({ code: 200, data: { pending, approved, rejected } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.put('/review-queue/:id/approve', async (req, res) => {
  try {
    const entry = await ReviewQueueModel.findById(req.params.id)
    if (!entry) {
      return res.status(404).json({ code: 404, msg: '审核记录不存在' })
    }

    entry.status = 'approved'
    entry.reviewedBy = req.admin._id
    entry.reviewedAt = new Date()
    await entry.save()

    logService.admin(req.admin._id, req.admin.username, '审核通过', `${entry.targetType === 'product' ? '商品' : '评价'}审核通过, ID: ${entry.targetId}`, req.ip)

    res.json({ code: 200, msg: '审核通过' })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

router.put('/review-queue/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body
    const entry = await ReviewQueueModel.findById(req.params.id)
    if (!entry) {
      return res.status(404).json({ code: 404, msg: '审核记录不存在' })
    }

    entry.status = 'rejected'
    entry.reviewedBy = req.admin._id
    entry.reviewedAt = new Date()
    entry.rejectReason = reason || '管理员拒绝'
    await entry.save()

    // 拒绝后删除对应内容
    if (entry.targetType === 'product') {
      await ProductModel.findByIdAndUpdate(entry.targetId, { shopStatus: 3 })
      logService.admin(req.admin._id, req.admin.username, '审核拒绝-删除商品', `商品ID: ${entry.targetId}, 理由: ${reason}`, req.ip)
    } else if (entry.targetType === 'review') {
      await ReviewModel.findByIdAndDelete(entry.targetId)
      logService.admin(req.admin._id, req.admin.username, '审核拒绝-删除评价', `评价ID: ${entry.targetId}, 理由: ${reason}`, req.ip)
    }

    res.json({ code: 200, msg: '已拒绝并删除对应内容' })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

module.exports = router
