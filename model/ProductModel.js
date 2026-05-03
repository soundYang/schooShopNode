const mongoose = require('mongoose')

const ProductSchema = new mongoose.Schema({
  userId: {
  type: String,
  required: true
 },
 shopName: {
  type: String,
  required: true
 },
 shopPrice: {
  type: Number,
  required: true
 },
 shopActualValue: {
  type: Number,
  required: true
 },
 shopImg: {
  type: Array,
  required: true
 },
 shopNum: {
  type: Number,
  required: true
 },
 shopMsg: {
  type: String,
  required: true
 },
 shopType: {
  type: Array,
  required: true
 },
 isBlindBox: {
  type: Boolean,
  default: true,
  required: true
 },
 publishAddress: {
  type: Object,
  required: true
 },
 shopStatus: {
  type: Number,
  default: 0,
  required: true,
  enum: [0, 1, 2, 3]
 },
 createTime: {
  type: Date,
  default: Date.now
 },
 viewCount: {
  type: Number,
  default: 0
 }
})

ProductSchema.index({ shopStatus: 1, viewCount: -1, createTime: -1 })
ProductSchema.index({ userId: 1, createTime: -1 })
ProductSchema.index({ shopStatus: 1, shopType: 1 })
ProductSchema.index({ isBlindBox: 1, shopNum: 1 })

const ProductModel = mongoose.model('Product', ProductSchema)

module.exports = ProductModel