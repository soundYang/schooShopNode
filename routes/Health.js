const router = require('express').Router()
const mongoose = require('mongoose')

router.get('/', async (req, res) => {
  const status = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'ok' : 'error',
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    },
    pid: process.pid,
    pm2_id: process.env.pm_id || 'standalone'
  }

  const httpCode = status.mongodb === 'ok' ? 200 : 503
  res.status(httpCode).json(status)
})

module.exports = router
