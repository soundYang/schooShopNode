const tf = require('@tensorflow/tfjs')
const nsfwjs = require('nsfwjs')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

let model = null

async function getModel() {
  if (!model) {
    model = await nsfwjs.load()
  }
  return model
}

async function classifyImage(filePath) {
  const m = await getModel()
  const { data, info } = await sharp(filePath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const image = tf.tensor3d(new Uint8Array(data), [info.height, info.width, info.channels])
  try {
    const predictions = await m.classify(image)
    return predictions
  } finally {
    image.dispose()
  }
}

const NSFW_CATEGORIES = ['Porn', 'Hentai', 'Sexy']

function imageModeration(options = {}) {
  const { threshold = 0.5 } = options

  return async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        req.imageModeration = { passed: true, results: [] }
        return next()
      }

      const results = []
      let hasNSFW = false

      for (const file of req.files) {
        const filePath = path.resolve(file.path)
        try {
          const predictions = await classifyImage(filePath)
          const nsfwItems = predictions.filter(p =>
            NSFW_CATEGORIES.includes(p.className) && p.probability > threshold
          )

          if (nsfwItems.length > 0) {
            hasNSFW = true
          }

          results.push({
            filename: file.filename,
            predictions,
            isNSFW: nsfwItems.length > 0
          })
        } catch (err) {
          console.error('图片审核失败:', file.originalname, err.message)
          results.push({
            filename: file.filename,
            isNSFW: false,
            error: err.message
          })
        }
      }

      if (hasNSFW) {
        for (const file of req.files) {
          try { fs.unlinkSync(file.path) } catch (e) {}
        }
        return res.status(400).json({
          code: 400,
          msg: '图片包含违规内容，请重新上传'
        })
      }

      req.imageModeration = { passed: true, results }
      next()
    } catch (err) {
      console.error('图片审核中间件错误:', err)
      req.imageModeration = { passed: true, results: [] }
      next()
    }
  }
}

module.exports = { imageModeration }
