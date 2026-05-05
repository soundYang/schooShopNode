const isDev = process.env.NODE_ENV !== 'production'

const logger = {
  log: (...args) => {
    if (isDev) console.log(...args)
  },
  error: (...args) => {
    console.error(...args)
  },
  info: (...args) => {
    if (isDev) console.log('[INFO]', ...args)
  },
  warn: (...args) => {
    if (isDev) console.warn('[WARN]', ...args)
  }
}

module.exports = logger
