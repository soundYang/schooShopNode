const express = require('express')
const ProductModel = require('../model/ProductModel.js')
const router = express.Router()

const checkTokenMiddleware = require('../middlewares/checkTokenMiddelware.js')

// 创建商品信息
router.post('/create', checkTokenMiddleware, async (req,res) => {
  try {
    const currentUserId = req.user._id

    /**
     * 商品信息校验
     */
    const productData = {
      ...req.body,
      userId: currentUserId,
      shopStatus: 1
    }
    const data = await ProductModel.create(productData)

    if(data) {
      res.send({
        code:200,
        msg:'创建成功'
      })
    } else {
      res.send({
        code:400,
        msg:'创建失败'
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
    const data = await ProductModel.findOne({
      _id: req.query.id
    })
    if(!data) {
      return res.send({
        code:400,
        msg:'获取失败'
      })
    }
    res.send({
      code:200,
      data,
      msg:'获取成功'
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
    const shopStatus = req.query.shopStatus  // 商品状态
    
    if (page < 1 || pageSize < 1) {
      return res.status(400).json({ code: 400, msg: '页码和每页条数必须为正整数' })
    }

    // 计算跳过的文档数
    const skip = (page - 1) * pageSize

    // 查询条件：只获取 shopStatus = 1 的商品
    const query = { shopStatus }

    // 查询数据（带分页）和总记录数（使用 Promise.all 并发执行提升效率）
    const [data, total] = await Promise.all([
      ProductModel.find(query)
        .skip(skip)
        .limit(pageSize)
        .sort({ careteTime: -1 }), // 推荐按创建时间倒序，让最新商品在前
      ProductModel.countDocuments(query)  // 获取总记录数
    ])

    res.json({
      code: 200,
      data,
      total,           // 总记录数
      page,            // 当前页码
      pageSize,        // 每页条数
      totalPages: Math.ceil(total / pageSize), // 总页数
      msg: '获取成功'
    })
  } catch (err) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 获取单个用户发布的商品
router.get('/getUserProducts',checkTokenMiddleware, async (req, res) => {
  try {
    const userId = req.user._id
    const { page = 1, pageSize = 10 } = req.query

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    const [data, total] = await Promise.all([
      ProductModel.find({userId})
        .skip(skip)
        .limit(limit)
        .sort({ careteTime: -1 }), // 推荐按创建时间倒序，让最新商品在前
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
router.delete('/delPro',checkTokenMiddleware, async (req, res) => {
  try {
    const productId = req.query._id  // 商品id

    // 先查询商品，获取发布者的 userId
    const product = await ProductModel.findById(productId) 
    if (!product) {
      return res.status(404).json({ code: 404, msg: '商品不存在' })
    }

    // 删除商品文档
    await ProductModel.findByIdAndDelete(productId)

    res.json({ code: 200, msg: '删除成功' })
  } catch (err) {
   res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 更新商品信息
router.post('/updatePro',checkTokenMiddleware, async (req, res) => {
  try {
    const { _id, ...updateData } = req.body
    
    // 验证商品ID是否存在
    if (!_id) {
      return res.status(400).json({ code: 400, msg: '未查询到商品' })
    }
    
    /**
     * 商品信息校验
     */

    // 执行更新操作，返回更新后的文档
    const updatedProduct = await ProductModel.findByIdAndUpdate(
      _id, 
      {
        ...updateData,
        userId: req.user._id
      },
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

// 模糊搜索商品
router.post('/searchPro', async (req, res) => {
  try {
    const { keyword, page = 1, pageSize = 10 } = req.body

    // 如果没有关键字，返回空数组（或按需处理）
    if (!keyword) {
      return res.json({
        code: 200,
        data: [],
        total: 0,
        msg: '请提供搜索关键字'
      })
    }

    // 创建不区分大小写的正则表达式
    const regex = new RegExp(keyword, 'i')

    // 构建查询条件：在商品名称和商品描述中搜索
    const query = {
      $or: [
        { shopName: { $regex: regex } },
        { shopMsg: { $regex: regex } }
      ],
      shopStatus: 1
    }

    // 计算分页
    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const limit = parseInt(pageSize)

    // 并行查询：获取匹配的商品和总数
    const [products, total] = await Promise.all([
      ProductModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ careteTime: -1 }), // 按创建时间倒序
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
    res.status(500).send(error)
  }
})

// 根据关键字获取商品列表(热门商品, 新鲜好物)
router.get('/keyProList', async (req, res) => { 
   try{
    const { key } = req.query
    let query = {}
    if(key === 'hot'){
      query = { viewCount: -1 }
    } else if(key === 'new'){
      query = { craeteTime: -1 }
    } else{``
      return res.json({
        code: 400,
        msg: '无效参数'
      })
    }

    const products = await ProductModel.find().sort(query).limit(8)
    res.json({
      code: 200,
      data: products
    })
   } catch (error) {
    console.error(error)
    res.status(500).send(error)
  }
})

module.exports = router