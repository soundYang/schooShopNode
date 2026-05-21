const Product = require('../model/ProductModel')
const BlindBoxRecord = require('../model/BlindBoxRecordModel')
const User = require('../model/UserModel')
const OrderModel = require('../model/OrderModel')
const ConfigModel = require('../model/ConfigModel')
const mongoose = require('mongoose')

const PRICE_POOL = [0.99, 6.99, 9.99, 19.9, 39.9, 69.9]

const BLIND_BOX_OPEN_THRESHOLD = 150
const BLIND_BOX_CLOSE_THRESHOLD = 80
const CONFIG_KEY = 'blindBoxOpen'

async function getBlindBoxProductCount() {
  return await Product.countDocuments({ isBlindBox: true, shopStatus: 1, shopNum: { $gt: 0 } })
}

async function isBlindBoxOpen() {
  const config = await ConfigModel.findOne({ key: CONFIG_KEY })
  return config ? config.value : false
}

async function setBlindBoxOpen(open) {
  await ConfigModel.findOneAndUpdate(
    { key: CONFIG_KEY },
    { value: open },
    { upsert: true }
  )
}

async function checkAndUpdateBlindBoxState() {
  if (process.env.BLIND_BOX_IGNORE_LIMIT === 'true') {
    const productCount = await getBlindBoxProductCount()
    return { open: true, count: productCount, changed: false }
  }

  const productCount = await getBlindBoxProductCount()
  const currentlyOpen = await isBlindBoxOpen()

  if (currentlyOpen) {
    if (productCount <= BLIND_BOX_CLOSE_THRESHOLD) {
      await setBlindBoxOpen(false)
      return { open: false, count: productCount, changed: true }
    }
    return { open: true, count: productCount, changed: false }
  }

  if (productCount > BLIND_BOX_OPEN_THRESHOLD) {
    await setBlindBoxOpen(true)
    return { open: true, count: productCount, changed: true }
  }

  return { open: false, count: productCount, changed: false }
}

async function selectProductByPrice(randomPrice, excludeProductIds = []) {
  const isLocalMode = process.env.BLIND_BOX_IGNORE_LIMIT === 'true'

  const baseFilter = {
    isBlindBox: true,
    shopNum: { $gt: 0 },
    _id: { $nin: excludeProductIds },
    ...(isLocalMode ? {} : { shopStatus: 1 })
  }

  let candidates
  if (isLocalMode) {
    candidates = await Product.find(baseFilter).limit(20)
  } else {
    const min = randomPrice * 0.5
    const max = randomPrice * 1.5
    candidates = await Product.find({
      ...baseFilter,
      shopActualValue: { $gte: min, $lte: max }
    }).limit(10)
  }

  if (candidates.length === 0) return null

  return candidates[Math.floor(Math.random() * candidates.length)]
}

async function generateUserBlindBoxes(userId, date) {
  const existing = await BlindBoxRecord.findOne({ userId, date })
  if (existing) return existing

  const state = await checkAndUpdateBlindBoxState()
  if (!state.open) {
    throw new Error('盲盒暂未开放，商品种类不足')
  }

  const ownProducts = await Product.find({ userId }).select('_id')
  const ownProductIds = ownProducts.map(p => p._id)

  const activeOrders = await OrderModel.find({
    buyerId: String(userId),
    status: { $in: [0, 1, 2] }
  }).select('productId')
  const orderingProductIds = activeOrders.map(o => o.productId)

  const isLocalMode = process.env.BLIND_BOX_IGNORE_LIMIT === 'true'
  const excludeProductIds = isLocalMode ? [...ownProductIds] : [...ownProductIds, ...orderingProductIds]
  const MAX_RETRIES = 3

  const boxes = []
  for (let i = 0; i < 4; i++) {
    let product = null
    let randomPrice = PRICE_POOL[Math.floor(Math.random() * PRICE_POOL.length)]

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      product = await selectProductByPrice(randomPrice, excludeProductIds)
      if (product) break
      randomPrice = PRICE_POOL[Math.floor(Math.random() * PRICE_POOL.length)]
    }

    if (!product) {
      throw new Error('盲盒商品种类不足，无法生成足够的盲盒')
    }

    excludeProductIds.push(product._id)

    const firstLabel = product.shopType && product.shopType.length > 0 ? product.shopType[0] : ''

    boxes.push({
      randomPrice,
      productId: product._id,
      productSnapshot: {
        name: product.shopName,
        images: product.shopImg,
        actualValue: product.shopActualValue,
        msg: product.shopMsg,
        label: firstLabel
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

async function generateDailyBlindBoxes() {
  const state = await checkAndUpdateBlindBoxState()
  if (!state.open) {
    console.log(`盲盒未开放（当前 ${state.count} 种商品），跳过今日生成`)
    return
  }

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

async function restorePreviousBlindBoxes() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const records = await BlindBoxRecord.find({ date: yesterdayStr })
  for (const record of records) {
    for (const box of record.boxes) {
      if (box.status === 1 && box.orderId) {
        const order = await OrderModel.findById(box.orderId)
        if (order && order.status === 0) {
          order.status = 4
          order.cancelReason = '盲盒订单超时未支付，系统自动取消'
          order.cancelTime = new Date()
          await order.save()
          await Product.findByIdAndUpdate(box.productId, { $inc: { shopNum: 1 } })
          await Product.findOneAndUpdate(
            { _id: box.productId, shopNum: { $gt: 0 }, shopStatus: 2 },
            { shopStatus: 1 }
          )
          console.log(`盲盒订单超时自动取消: ${order._id}，已还原库存`)
        }
      }
    }
  }
  await BlindBoxRecord.deleteMany({ date: yesterdayStr })
}

module.exports = {
  generateDailyBlindBoxes,
  generateUserBlindBoxes,
  restorePreviousBlindBoxes,
  checkAndUpdateBlindBoxState,
  getBlindBoxProductCount,
  BLIND_BOX_OPEN_THRESHOLD,
  BLIND_BOX_CLOSE_THRESHOLD
}
