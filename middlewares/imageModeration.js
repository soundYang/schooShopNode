const { moderateImagesAsync: baiduModerate } = require('./baiduModeration')

function imageModeration(options = {}) {
  const { threshold = 0.5 } = options

  return async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        req.imageModeration = { passed: true, results: [] }
        return next()
      }

      const result = await baiduModerate(req.files)

      if (!result.passed) {
        return res.status(400).json({
          code: 400,
          msg: `图片包含违规内容: ${result.reason}`
        })
      }

      req.imageModeration = { passed: true, results: [] }
      next()
    } catch (err) {
      console.error('图片审核中间件错误:', err)
      req.imageModeration = { passed: true, results: [] }
      next()
    }
  }
}

async function moderateImagesAsync(files) {
  return baiduModerate(files)
}

module.exports = { imageModeration, moderateImagesAsync }
