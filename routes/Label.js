const express = require('express')
const LabelModel = require('../model/LabelModel')
const router = express.Router()

// 创建标签文档
router.post('/', async (req, res) => {
  try {
    const { mainLabel, attributeLabel, hotLabel } = req.body
    const newLabel = new LabelModel({
      mainLabel: mainLabel || [],
      attributeLabel: attributeLabel || [],
      hotLabel: hotLabel || []
    })
    const saved = await newLabel.save()
    res.send({ code: 200, data: saved, msg: '创建成功' })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// 获取所有标签文档
router.get('/', async (req, res) => {
  try {
    const labels = await LabelModel.find()
    res.send({ code: 200, data: labels })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message })
  }
})

// 新增：根据字段名返回对应的数组
router.get('/field', async (req, res) => {
  try {
    const fieldName = req.query.fieldName // 如 'mainLabel'
    const allowedFields = ['mainLabel', 'attributeLabel', 'hotLabel']
    
    if (!allowedFields.includes(fieldName)) {
      return res.send({ code: 400, msg: '无效的字段名' })
    }

    const labelDoc = await LabelModel.findOne(); // 或根据特定条件
    
    if (!labelDoc) {
      return res.send({ code: 400, msg: '标签配置不存在' })
    }

    const result = labelDoc[fieldName] || []
    res.send({ code: 200, data: result })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误', error: err.message });
  }
});

module.exports = router