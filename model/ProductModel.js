const e = require('express')
const mongoose = require('mongoose')

const ProductSchema = new mongoose.Schema({
  userId: {
  type: String,
  required: true  // 用户id
 },
 shopName: {
  type: String,
  required: true  // 商品名称
 },
 shopPrice: {
  type: Number,
  required: true  // 商品价格
 },
 shopActualValue: {
  type: Number,
  required: true  // 商品估值
 },
 shopImg: {
  type: Array,
  required: true  // 商品图片
 },
 shopNum: {
  type: Number,
  required: true  // 商品数量
 },
 shopMsg: {
  type: String,
  required: true  // 商品信息
 },
 shopType: {
  type: Array,
  required: true  // 商品类型
 },
 isBlindBox: {
  type: Boolean,
  default: true,
  required: true  // 是否支持该商品为盲盒
 },
 // 发货地址
 publishAddress: {
  type: Object,
  required: true  // 发货地址
 },
 /**
  * 状态：0待审核，1上架，2下架，3违规
  */
 shopStatus: {
  type: Number,
  default: 0,  // 商品状态
  required: true,
  enum: [0, 1, 2, 3]
 },
 createTime: {
  type: Date,
  default: new Date()  // 创建时间
 },
 viewCount: {
  type: Number,
  default: 0   // 浏览次数
 }
})

ProductSchema.index({ shopStatus: 1, shopNum: 1, createTime: -1 })
ProductSchema.index({ userId: 1, createTime: -1 })
ProductSchema.index({ shopName: 'text', shopMsg: 'text' })
ProductSchema.index({ shopType: 1, shopStatus: 1 })

const ProductModel = mongoose.model('Product', ProductSchema)

module.exports = ProductModel