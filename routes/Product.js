/**
 * 扩张模糊搜索
 */

const express = require('express')
const multer = require('multer')  
const ProductModel = require('../model/ProductModel.js')
const ReviewQueueModel = require('../model/ReviewQueueModel')
const router = express.Router()
const checkTokenMiddleware = require('../middlewares/checkTokenMiddleware.js')
const { contentModeration } = require('../middlewares/contentModeration')
const { imageModeration } = require('../middlewares/imageModeration')
const fs = require('fs').promises  
const path = require('path')

// 配置 multer 用于文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // 上传文件保存路径
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + '-' + file.originalname)
  }
})

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 限制单个文件 2MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片格式
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('只能上传图片文件'), false)
    }
  }
})

// 创建商品信息（支持文件上传）
router.post('/create',
  checkTokenMiddleware,
  upload.array('shopImg', 6),
  contentModeration({ checkFields: ['shopName', 'shopMsg'] }),
  imageModeration(),
  async (req, res) => {
  try {
    const currentUserId = req.user._id
    
    // 处理上传的图片文件
    const imageUrls = req.files ? req.files.map(file => {
      return `/uploads/${file.filename}`
    }) : []
    
    // 解析 JSON 字符串字段
    const shopType = req.body.shopType ? JSON.parse(req.body.shopType) : []
    const publishAddress = req.body.publishAddress ? JSON.parse(req.body.publishAddress) : {}
    
    // 构建商品数据
    const productData = {
      shopName: req.body.shopName,
      shopPrice: parseFloat(req.body.shopPrice),
      shopActualValue: parseFloat(req.body.shopActualValue),
      shopNum: parseInt(req.body.shopNum),
      shopMsg: req.body.shopMsg,
      isBlindBox: req.body.isBlindBox === 'true',
      shopType: shopType,
      publishAddress: publishAddress,
      shopImg: imageUrls,
      userId: currentUserId,
      shopStatus: 0
    }
    
    const data = await ProductModel.create(productData)
    
    // 如果包含图片，创建审核队列记录（管理员人工审核图片）
    if (data && imageUrls.length > 0) {
      setImmediate(async () => {
        try {
          await ReviewQueueModel.create({
            targetType: 'product',
            targetId: data._id,
            content: `${req.body.shopName} - ${(req.body.shopMsg || '').substring(0, 100)}`,
            images: imageUrls,
            reason: '包含上传图片，需管理员审核',
            status: 'pending',
            submittedBy: currentUserId
          })
        } catch (e) {
          console.error('创建商品审核记录失败:', e)
        }
      })
    }
    
    if (data) {
      res.send({
        code: 200,
        msg: imageUrls.length > 0 ? '创建成功，图片待管理员审核' : '创建成功'
      })
    } else {
      res.send({
        code: 400,
        msg: '创建失败'
      })
    }
  } catch (err) {
    console.log(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取单个商品信息
router.get('/getPro', async (req,res) => {
  try {
    const data = await ProductModel.findOneAndUpdate(
      { _id: req.query.id },
      { $inc: { viewCount: 1 } },
      { returnDocument: 'after' }
    )
    if(!data) {
      return res.send({
        code:400
      })
    }
    res.send({
      code:200,
      data
    })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取所有商品信息
router.get('/getAllPro', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1          // 当前页码，默认为1
    const pageSize = parseInt(req.query.pageSize) || 10 // 每页条数，默认为10
    
    if (page < 1 || pageSize < 1) {
      return res.status(400).json({ code: 400, msg: '页码和每页条数必须为正整数' })
    }

    // 计算跳过的文档数
    const skip = (page - 1) * pageSize

    const query = { shopStatus: { $in: [0, 1] }, shopNum: { $gt: 0 } }

    // 查询数据（带分页）和总记录数（使用 Promise.all 并发执行提升效率）
    const [data, total] = await Promise.all([
      ProductModel.find(query)
        .skip(skip)
        .limit(pageSize)
        .sort({ createTime: -1 }),
      ProductModel.countDocuments(query)
    ])

    res.json({
      code: 200,
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取单个用户发布的商品
router.get('/getUserProducts',checkTokenMiddleware, async (req, res) => {
  try {
    let userId
    if(req.query.id){
      userId = req.query.id
    } else {
      userId = req.user._id
    }
    const { page = 1, pageSize = 10 } = req.query

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [data, total] = await Promise.all([
      ProductModel.find({userId})
        .skip(skip)
        .limit(limit)
        .sort({ createTime: -1 }),
      ProductModel.countDocuments({userId})  // 获取总记录数
    ])
    res.json({
      code: 200,
      data,
      total
    })
  } catch (error) {
    console.log(error);
    
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 删除商品信息
router.delete('/delPro', checkTokenMiddleware, async (req, res) => {
  try {
    const productId = req.query._id
    console.log(req.query)
    

    // 1. 查询商品
    const product = await ProductModel.findById(productId)
    if (!product) {
      return res.status(404).json({ code: 404, msg: '商品不存在' })
    }

    // 2. 删除关联的图片文件（如果有）
    if (product.shopImg && product.shopImg.length) {
      // 并行删除所有图片
      const deletePromises = product.shopImg.map(async (imgUrl) => {
        try {
          // 提取文件名（例如 /uploads/xxx.jpg -> xxx.jpg）
          const filename = path.basename(imgUrl)
          const filePath = path.join(__dirname, '../uploads', filename)
          await fs.unlink(filePath)
          console.log(`已删除图片: ${filePath}`)
        } catch (err) {
          // 文件可能不存在，忽略错误
          console.warn(`删除图片失败（可能已不存在）: ${imgUrl}`, err.message)
        }
      })
      await Promise.all(deletePromises)
    }

    // 3. 删除数据库中的商品记录
    await ProductModel.findByIdAndDelete(productId)

    res.json({ code: 200, msg: '删除成功' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 更新商品信息
router.post('/updatePro', checkTokenMiddleware, contentModeration({ checkFields: ['shopName', 'shopMsg'] }), async (req, res) => {
  try {
    const { _id, ...updateData } = req.body
    
    // 验证商品ID是否存在
    if (!_id) {
      return res.status(400).json({ code: 400, msg: '未查询到商品' })
    }

    delete updateData.userId

    // 执行更新操作，返回更新后的文档
    const updatedProduct = await ProductModel.findByIdAndUpdate(
      _id, 
      updateData,
      { 
        returnDocument: 'after', // 返回更新后的文档（替代 { new: true }）
        runValidators: true      // 可选：确保更新符合模型的验证规则
      }
    )

    // 检查商品是否存在
    if (!updatedProduct) {
      return res.status(404).json({ code: 404, msg: '商品不存在' })
    }
    res.json({
      code: 200,
      msg: '更新成功'
    })
  } catch (err) {
    console.error('更新商品失败：', err)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 模糊搜索商品（优化：字符级分词，容错性更强）
router.post('/searchPro', async (req, res) => {
  try {
    const { keyword, page = 1, pageSize = 10 } = req.body

    if (!keyword || !keyword.trim()) {
      return res.json({
        code: 200,
        data: [],
        total: 0,
        msg: '请提供搜索关键字'
      })
    }

    const trimmedKeyword = keyword.trim()
    // 限制搜索关键词长度，防止 ReDoS 攻击
    if (trimmedKeyword.length > 20) {
      return res.json({ code: 400, msg: '搜索关键词过长，最多支持20个字符' })
    }
    const chars = [...new Set(trimmedKeyword.split(''))]

    // 每个字符只需在 shopName、shopMsg 或 shopType 中任意一处出现即可
    // 例如搜"手蓝"，可匹配名称含"手"、描述含"蓝"的商品
    const charConditions = chars.map(char => ({
      $or: [
        { shopName: { $regex: char, $options: 'i' } },
        { shopMsg: { $regex: char, $options: 'i' } },
        { shopType: { $regex: char, $options: 'i' } }
      ]
    }))

    const query = {
      $and: [
        { shopStatus: { $in: [0, 1] }, shopNum: { $gt: 0 } },
        ...charConditions
      ]
    }

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [products, total] = await Promise.all([
      ProductModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ viewCount: -1, createTime: -1 }),
      ProductModel.countDocuments(query)
    ])

    res.json({
      code: 200,
      data: products,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / parseInt(pageSize))
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 根据关键字获取商品列表(热门商品, 新鲜好物)
router.get('/keyProList', async (req, res) => {
  try {
    const { key } = req.query
    const filter = { shopStatus: { $in: [0, 1] }, shopNum: { $gt: 0 } }
    let sort = {}

    if (key === 'hot') {
      sort = { viewCount: -1 }
    } else if (key === 'new') {
      sort = { createTime: -1 }
    } else {
      return res.json({
        code: 400,
        msg: '无效参数'
      })
    }

    const products = await ProductModel.find(filter).sort(sort).limit(8)
    res.json({
      code: 200,
      data: products
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 根据标签搜索商品（支持分页）
router.post('/tagSearch', async (req, res) => {
  try {
    const { tags, page = 1, pageSize = 10 } = req.body.params || req.body
    // 如果没有提供标签，返回空数组（或可按需求返回所有商品）

    if (!tags || (Array.isArray(tags) && tags.length === 0)) {
      return res.json({
        code: 200,
        data: [],
        total: 0,
        msg: '请提供标签列表'
      })
    }

    // 处理 tags 参数：可以是数组，也可以是逗号分隔的字符串
    let tagArray = []
    if (Array.isArray(tags)) {
      tagArray = tags
    } else if (typeof tags === 'string') {
      tagArray = tags.split(',').map(t => t.trim()).filter(t => t)
    }

    if (tagArray.length === 0) {
      return res.json({
        code: 200,
        data: [],
        total: 0,
      })
    }

    const query = { shopStatus: { $in: [0, 1] }, shopNum: { $gt: 0 }, shopType: { $in: tagArray } }

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    // 并行查询商品列表和总数
    const [products, total] = await Promise.all([
      ProductModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createTime: -1 }), // 按创建时间倒序
      ProductModel.countDocuments(query)
    ])

    res.json({
      code: 200,
      data: products,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / parseInt(pageSize)),
    })
  } catch (error) {
    console.error('标签搜索失败：', error)
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

module.exports = router