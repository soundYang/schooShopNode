const store = new Map()

const TTL = 5 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL) {
      store.delete(id)
    }
  }
}, 60 * 1000)

module.exports = {
  set(id, text) {
    store.set(id, { text: text.toLowerCase(), createdAt: Date.now() })
  },

  get(id) {
    const entry = store.get(id)
    return entry ? entry.text : null
  },

  verify(id, text) {
    const entry = store.get(id)
    if (!entry) return false
    const passed = entry.text === text.toLowerCase()
    store.delete(id)
    return passed
  },

  delete(id) {
    store.delete(id)
  }
}
