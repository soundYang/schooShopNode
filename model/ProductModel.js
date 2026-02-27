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
 /**
  * 状态：0待审核，1上架，2下架，3违规
  */
 shopStatus: {
  type: Number,
  default: 0  // 商品状态
 },
 careteTime: {
  type: Date,
  default: Date.now  // 创建时间
 },
 viewCount: {
  type: Number,
  default: 0   // 浏览次数
 }
})

const ProductModel = mongoose.model('Product', ProductSchema)

module.exports = ProductModel