const express = require('express')
const LabelModel = require('../model/LabelModel')
const { cache } = require('../ToolFunction/redisClient')
const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const { mainLabel, attributeLabel, hotLabel } = req.body
    const newLabel = new LabelModel({
      mainLabel: mainLabel || { name: '主标签', items: [] },
      attributeLabel: attributeLabel || { name: '属性标签', items: [] },
      hotLabel: hotLabel || { name: '热门标签', items: [] }
    })
    const saved = await newLabel.save()
    cache.del('label:all')
    cache.del('label:field:*')
    res.send({ code: 200, data: saved, msg: '创建成功' })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

router.get('/', async (req, res) => {
  try {
    const labels = await cache.wrap('label:all', 600, () => LabelModel.find().lean())
    res.send({ code: 200, data: labels })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

router.get('/field', async (req, res) => {
  try {
    const fieldName = req.query.fieldName
    const allowedFields = ['mainLabel', 'attributeLabel', 'hotLabel']

    if (!allowedFields.includes(fieldName)) {
      return res.send({ code: 400, msg: '无效的字段名' })
    }

    const cacheKey = `label:field:${fieldName}`
    const result = await cache.wrap(cacheKey, 600, async () => {
      const labelDoc = await LabelModel.findOne().lean()
      if (!labelDoc) return null
      return labelDoc[fieldName] || { name: '', items: [] }
    })

    if (!result) {
      return res.send({ code: 400, msg: '标签配置不存在' })
    }

    res.send({ code: 200, data: result })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

module.exports = router
