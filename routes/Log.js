const express = require('express')
const mongoose = require('mongoose')
const LogModel = require('../model/LogModel')
const checkAdminMiddleware = require('../middlewares/checkAdminMiddleware')
const logService = require('../ToolFunction/logService')
const router = express.Router()

router.use(checkAdminMiddleware)

async function enrichLogs(logs) {
  const UserModel = mongoose.model('User')
  const AdminModel = mongoose.model('Admin')

  const userIds = [...new Set(logs.filter(l => l.userId).map(l => l.userId.toString()))]
  const adminIds = [...new Set(logs.filter(l => l.adminId).map(l => l.adminId.toString()))]

  const [users, admins] = await Promise.all([
    userIds.length ? UserModel.find({ _id: { $in: userIds } }).select('UserName').lean() : [],
    adminIds.length ? AdminModel.find({ _id: { $in: adminIds } }).select('username').lean() : []
  ])

  const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]))
  const adminMap = Object.fromEntries(admins.map(a => [a._id.toString(), a]))

  return logs.map(l => {
    const log = l.toObject ? l.toObject() : l
    if (log.userId) {
      const user = userMap[log.userId.toString()]
      if (user) log.userId = user
      else log.userId = null
    }
    if (log.adminId) {
      const admin = adminMap[log.adminId.toString()]
      if (admin) log.adminId = admin
      else log.adminId = null
    }
    return log
  })
}

router.get('/list', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, type, level, keyword, startDate, endDate, adminId, userId } = req.query
    const query = {}

    if (type) query.type = type
    if (level) query.level = level
    if (adminId) {
      if (mongoose.Types.ObjectId.isValid(adminId)) query.adminId = new mongoose.Types.ObjectId(adminId)
      else return res.json({ code: 200, data: { list: [], total: 0 } })
    }
    if (userId) {
      if (mongoose.Types.ObjectId.isValid(userId)) query.userId = new mongoose.Types.ObjectId(userId)
      else return res.json({ code: 200, data: { list: [], total: 0 } })
    }

    if (keyword) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escaped, 'i')
      query.$or = [
        { username: regex },
        { action: regex },
        { detail: regex },
        { target: regex },
        { ip: regex }
      ]
    }

    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        query.createdAt.$lte = end
      }
    }

    const [logs, total] = await Promise.all([
      LogModel.find(query)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .lean(),
      LogModel.countDocuments(query)
    ])

    const enriched = await enrichLogs(logs)

    res.json({ code: 200, data: { list: enriched, total } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '获取日志列表失败', error: err.message })
  }
})

router.get('/stats', async (req, res) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [totalCount, todayCount, typeStats, loginCount, registerCount, errorCount] = await Promise.all([
      LogModel.countDocuments({}),
      LogModel.countDocuments({ createdAt: { $gte: today } }),
      LogModel.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      LogModel.countDocuments({ type: 'login', createdAt: { $gte: today } }),
      LogModel.countDocuments({ type: 'register', createdAt: { $gte: today } }),
      LogModel.countDocuments({ level: 'error' })
    ])

    res.json({
      code: 200,
      data: {
        totalCount,
        todayCount,
        loginCount,
        registerCount,
        errorCount,
        typeStats: typeStats.reduce((acc, item) => {
          acc[item._id] = item.count
          return acc
        }, {})
      }
    })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '获取日志统计失败', error: err.message })
  }
})

router.get('/recent', async (req, res) => {
  try {
    const logs = await LogModel.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()

    const enriched = await enrichLogs(logs)

    res.json({ code: 200, data: enriched })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '获取最近日志失败' })
  }
})

router.delete('/clear', async (req, res) => {
  try {
    const { days = 30 } = req.query
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - Number(days))

    const result = await LogModel.deleteMany({ createdAt: { $lt: cutoff } })

    await logService.admin(req.admin._id, req.admin.username, '清理日志', `清理了 ${result.deletedCount} 条 ${days} 天前的日志`, req.ip)

    res.json({ code: 200, msg: `已清理 ${result.deletedCount} 条日志`, data: { deletedCount: result.deletedCount } })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '清理日志失败' })
  }
})

module.exports = router
