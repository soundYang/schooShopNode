const isDev = process.env.NODE_ENV !== 'production'

function getCSTTime() {
  const date = new Date()
  const offset = 8 * 60 * 60 * 1000
  const cst = new Date(date.getTime() + offset)
  return cst.toISOString().replace('Z', '+08:00')
}

const logger = {
  log: (...args) => {
    if (isDev) console.log(`[${getCSTTime()}]`, ...args)
  },
  error: (...args) => {
    console.error(`[${getCSTTime()}]`, ...args)
  },
  info: (...args) => {
    if (isDev) console.log(`[${getCSTTime()}] [INFO]`, ...args)
  },
  warn: (...args) => {
    if (isDev) console.warn(`[${getCSTTime()}] [WARN]`, ...args)
  }
}

module.exports = logger
