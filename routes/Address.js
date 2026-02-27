const express = require('express')
const router = express.Router()
const UserModel = require('../model/UserModel')
const AddressModel = require('../model/AddressModel')
const checkTokenMiddleware = require('../middlewares/checkTokenMiddelware')

router.use(checkTokenMiddleware)

// 添加地址
router.post('/add',  async (req, res) => {
  const userId = req.user._id  // 从 token 获取
  const addressData = req.body

  /**
   * 地址信息校验
   */

 try {
  // 如果地址数量超过6个，则不允许添加
  const count = await AddressModel.countDocuments({
    userId
  })
  
  if(count >= 6) {
    return res.json({
      code: 400,
      msg: '最多添加6个地址'
    })
  }
    // 创建地址文档
  const address = await AddressModel.create({ ...addressData, userId })
 
  // 将地址 ID 添加到用户 addresses 数组
  await UserModel.findByIdAndUpdate(userId, {
    $push: { Addresses: address._id }
  })

  // 如果是第一个地址或标记为默认，则设置 defaultAddress
  if (addressData.isDefault || (await AddressModel.countDocuments({ userId })) === 1) {
    await UserModel.findByIdAndUpdate(userId, { defaultAddress: address._id })
    // 确保其他地址 isDefault 设为 false（可选）
    await AddressModel.updateMany({ userId, _id: { $ne: address._id } }, { isDefault: false })
  }

  res.json({ code: 200, msg: '地址添加成功' })
 } catch (error) {
  res.status(500).json({ code: 500, msg: '服务器错误' })
 }

})

// 获取用户所有地址
router.get('/list', async (req, res) => {
  const userId = req.user._id
  
  try {
    const addresses = await AddressModel.find({ userId }).sort({ isDefault: -1, createdAt: -1 })
    res.json({ code: 200, data: addresses })
  } catch (error) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})

// 更新地址
router.post('/update', async (req, res) => {
  const { addressId, ...updateData } = req.body
  const userId = req.user._id
  
  /**
   * 地址信息校验
   */

 try { 
    // 确保该地址属于当前用户（安全）
  const address = await AddressModel.findOneAndUpdate(
    { _id: addressId, userId },
    updateData,
    { returnDocument: 'after', runValidators: true }
  )
  if (!address) {
    return res.status(404).json({ code: 404, msg: '地址不存在或无权限' })
  }

  // 如果更新了 isDefault，处理默认地址逻辑
  if (updateData.isDefault) {
    await AddressModel.updateMany({ userId, _id: { $ne: addressId } }, { isDefault: false })
    await UserModel.findByIdAndUpdate(userId, { defaultAddress: addressId })
  }

  res.json({ code: 200,  msg: '更新成功' })
 } catch (error) {
  res.status(500).json({ code: 500, msg: '服务器错误' })
 }
})

// 删除地址
router.delete('/del', async (req, res) => {
  const { addressId } = req.query
  const userId = req.user._id

  try {
      const address = await AddressModel.findOneAndDelete({ _id: addressId, userId })
      if (!address) return res.status(404).json({ code: 404, msg: '地址不存在' })

      // 从用户 addresses 数组中移除
      await UserModel.findByIdAndUpdate(userId, { $pull: { Addresses: addressId } })

      // 如果删除的是默认地址，需要重新设置默认地址（例如设为第一个）
      const user = await UserModel.findById(userId)
      if (user.defaultAddress && user.defaultAddress.toString() === addressId) {
        const firstAddress = await AddressModel.findOne({ userId })
        user.defaultAddress = firstAddress ? firstAddress._id : null
        await user.save()
      }

      res.json({ code: 200, msg: '删除成功' })
  } catch (error) {
    res.status(500).json({ code: 500, msg: '服务器错误' })
  }
})


module.exports = router

