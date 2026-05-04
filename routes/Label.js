const express = require('express')
const LabelModel = require('../model/LabelModel')
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
    res.send({ code: 200, data: saved, msg: '创建成功' })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

router.get('/', async (req, res) => {
  try {
    const labels = await LabelModel.find()
    const normalized = labels.map(l => ({
      _id: l._id,
      mainLabel: normalizeLabel(l.mainLabel),
      attributeLabel: normalizeLabel(l.attributeLabel),
      hotLabel: normalizeLabel(l.hotLabel)
    }))
    res.send({ code: 200, data: normalized })
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

    const labelDoc = await LabelModel.findOne()

    if (!labelDoc) {
      return res.send({ code: 400, msg: '标签配置不存在' })
    }

    const result = normalizeLabel(labelDoc[fieldName])
    res.send({ code: 200, data: result })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

function normalizeLabel(label) {
  if (!label) return { name: '', items: [] }
  if (typeof label === 'string') {
    try { label = JSON.parse(label) } catch { return { name: '', items: [] } }
  }
  if (Array.isArray(label)) {
    if (label.length === 1 && label[0] && typeof label[0] === 'object' && Array.isArray(label[0].items)) {
      return label[0]
    }
    return { name: '', items: label }
  }
  if (Array.isArray(label.items)) return label
  return { name: label.name || '', items: [] }
}

module.exports = router
