function timezonePlugin(schema) {
  function transformDates(obj) {
    if (obj === null || obj === undefined) return
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (val instanceof Date) {
        const d = new Date(val.getTime() + 8 * 60 * 60 * 1000)
        obj[key] = d.toISOString().replace('Z', '+08:00')
      } else if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object') transformDates(item)
        }
      } else if (val && typeof val === 'object' && !(val instanceof Date)) {
        transformDates(val)
      }
    }
  }

  const originalToJSON = schema.options.toJSON
  schema.options.toJSON = originalToJSON || {}
  const existingTransform = schema.options.toJSON.transform
  schema.options.toJSON.transform = function (doc, ret) {
    if (existingTransform) {
      const result = existingTransform(doc, ret)
      if (result !== undefined) ret = result
    }
    transformDates(ret)
    return ret
  }

  const originalToObject = schema.options.toObject
  schema.options.toObject = originalToObject || {}
  const existingToObjectTransform = schema.options.toObject.transform
  schema.options.toObject.transform = function (doc, ret) {
    if (existingToObjectTransform) {
      const result = existingToObjectTransform(doc, ret)
      if (result !== undefined) ret = result
    }
    transformDates(ret)
    return ret
  }
}

module.exports = timezonePlugin
