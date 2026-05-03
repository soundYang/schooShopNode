const express = require('express')
const router = express.Router()
const NotificationModel = require('../model/NotificationModel')
const checkTokenMiddleware = require('../middlewares/checkTokenMiddleware')

router.use(checkTokenMiddleware)

// 获取通知列表
router.get('/list', async (req, res) => {
  try {
    const userId = req.user._id
    const { page = 1, pageSize = 20, unreadOnly } = req.query

    const query = { userId }
    if (unreadOnly === 'true') query.isRead = false

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [notifications, total] = await Promise.all([
      NotificationModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      NotificationModel.countDocuments(query)
    ])

    res.json({
      code: 200,
      data: notifications,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取未读通知数量
router.get('/unreadCount', async (req, res) => {
  try {
    const userId = req.user._id
    const count = await NotificationModel.countDocuments({ userId, isRead: false })
    res.json({ code: 200, data: { count } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 标记单条通知为已读
router.put('/read/:id', async (req, res) => {
  try {
    const userId = req.user._id
    const notification = await NotificationModel.findOneAndUpdate(
      { _id: req.params.id, userId },
      { isRead: true },
      { returnDocument: 'after' }
    )
    if (!notification) {
      return res.status(404).json({ code: 404, msg: '通知不存在' })
    }
    res.json({ code: 200 })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 全部标记为已读
router.put('/readAll', async (req, res) => {
  try {
    const userId = req.user._id
    await NotificationModel.updateMany(
      { userId, isRead: false },
      { isRead: true }
    )
    res.json({ code: 200 })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

module.exports = router
