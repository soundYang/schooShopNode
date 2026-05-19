const Redis = require('ioredis')

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || '',
  retryStrategy(times) {
    if (times > 3) return null
    return Math.min(times * 200, 2000)
  },
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableOfflineQueue: false
})

let redisReady = false

redis.on('connect', () => {
  redisReady = true
  console.log('[Redis] 连接成功')
})

redis.on('error', (err) => {
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    if (!redisReady) console.log('[Redis] 未连接，将跳过缓存直接查库')
    redisReady = false
  }
})

redis.on('close', () => {
  redisReady = false
})

const cache = {
  async get(key) {
    if (!redisReady) return null
    try { return await redis.get(key) } catch { return null }
  },

  async set(key, value, ttl = 300) {
    if (!redisReady) return
    try { await redis.setex(key, ttl, JSON.stringify(value)) } catch {}
  },

  async del(pattern) {
    if (!redisReady) return
    try {
      const keys = await redis.keys(pattern)
      if (keys.length > 0) await redis.del(...keys)
    } catch {}
  },

  async wrap(key, ttl, fetchFn) {
    const cached = await cache.get(key)
    if (cached) {
      try { return JSON.parse(cached) } catch { return cached }
    }
    const data = await fetchFn()
    await cache.set(key, data, ttl)
    return data
  }
}

module.exports = { redis, cache }
