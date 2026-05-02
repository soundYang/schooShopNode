// services/blindBoxService.js

/**
 * 修改
 * 如果未找到符合价格的商品就重新随机价格
 * 重复次数达三次，抛出错误，提示用户商品库存不足
 * 同一个用户获取的盲盒的商品不能重复
 * 
 * 商品总数量大于150开启盲盒
 * 低于80关闭盲盒
 */
const Product = require('../model/ProductModel')
const BlindBoxRecord = require('../model/BlindBoxRecordModel')
const User = require('../model/UserModel')
const OrderModel = require('../model/OrderModel')
const mongoose = require('mongoose')

const PRICE_POOL = [0.99, 6.99, 9.99, 19.9, 39.9, 69.9]

/**
 * 根据随机价格，从符合条件的盲盒商品中随机抽取一个
 * @param {number} randomPrice 
 * @param {Array} excludeProductIds 需要排除的商品 ID 列表
 * @returns {Promise<Object>} 商品文档
 */
async function selectProductByPrice(randomPrice, excludeProductIds = []) {
  const min = randomPrice * 0.5
  const max = randomPrice * 1.5

  const baseFilter = {
    isBlindBox: true,
    shopNum: { $gt: 0 },
    _id: { $nin: excludeProductIds }
  }

  // 查找符合条件且库存>0的盲盒商品，按 shopActualValue 匹配
  const candidates = await Product.find({
    ...baseFilter,
    shopActualValue: { $gte: min, $lte: max }
  }).limit(10)

  if (candidates.length === 0) {
    // 降级：放宽范围（无价格限制），或从所有盲盒商品中抽取
    const fallback = await Product.find(baseFilter).limit(10)
    if (fallback.length === 0) throw new Error('没有可用的盲盒商品')
    return fallback[Math.floor(Math.random() * fallback.length)]
  }

  // 随机选择一条
  return candidates[Math.floor(Math.random() * candidates.length)]
}

/**
 * 为单个用户生成当天的盲盒（4个）
 * @param {string} userId 
 * @param {string} date 
 */
async function generateUserBlindBoxes(userId, date) {
  const existing = await BlindBoxRecord.findOne({ userId, date })
  if (existing) return existing

  // 排除用户自己卖的商品
  const ownProducts = await Product.find({ userId }).select('_id')
  const ownProductIds = ownProducts.map(p => p._id)

  // 排除用户有活跃订单（待付款/已付款/已发货）的商品
  const activeOrders = await OrderModel.find({
    buyerId: String(userId),
    status: { $in: [0, 1, 2] }
  }).select('productId')
  const orderingProductIds = activeOrders.map(o => o.productId)

  const excludeProductIds = [...ownProductIds, ...orderingProductIds]

  const boxes = []
  for (let i = 0; i < 4; i++) {
    const randomPrice = PRICE_POOL[Math.floor(Math.random() * PRICE_POOL.length)]
    let product = await selectProductByPrice(randomPrice, excludeProductIds)
    if (!product) continue

    const updated = await Product.findByIdAndUpdate(
      product._id,
      { $inc: { shopNum: -1 } },
      { new: true }
    )
    if (!updated || updated.shopNum < 0) continue

    // 获取第一个标签，若 shopType 为空则设为空字符串
    const firstLabel = product.shopType && product.shopType.length > 0 ? product.shopType[0] : ''

    boxes.push({
      randomPrice,
      productId: product._id,
      productSnapshot: {
        name: product.shopName,
        images: product.shopImg,
        actualValue: product.shopActualValue,
        msg: product.shopMsg,
        label: firstLabel    // 存储第一个标签
      },
      status: 0,
      createdAt: new Date()
    })
  }

  if (boxes.length === 0) throw new Error('生成盲盒失败，没有可用的商品')

  const record = new BlindBoxRecord({ userId, date, boxes })
  await record.save()
  return record
}

/**
 * 批量生成所有用户的每日盲盒（定时任务调用）
 */
async function generateDailyBlindBoxes() {
  const today = new Date().toISOString().split('T')[0]
  const users = await User.find({}, '_id')
  for (const user of users) {
    try {
      await generateUserBlindBoxes(user._id, today)
    } catch (err) {
      console.error(`生成用户 ${user._id} 盲盒失败:`, err)
    }
  }
  console.log('每日盲盒生成完成')
}

/**
 * 恢复昨天未购买盲盒的库存，并删除过期记录
 */
async function restorePreviousBlindBoxes() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const records = await BlindBoxRecord.find({ date: yesterdayStr })
  for (const record of records) {
    for (const box of record.boxes) {
      if (box.status === 0) {
        // 未购买，恢复库存
        await Product.findByIdAndUpdate(box.productId, { $inc: { shopNum: 1 } })
      }
    }
  }
  // 删除旧记录（可选）
  await BlindBoxRecord.deleteMany({ date: yesterdayStr })
}

module.exports = {
  generateDailyBlindBoxes,
  generateUserBlindBoxes,
  restorePreviousBlindBoxes
}