const mongoose = require('mongoose')

const LabelSchema = new mongoose.Schema({
  mainLabel:{
    type: Array,
    default: []
  },    // 主标签
  attributeLabel:{
    type: Array,
    default: []
  },   // 属性标签
  hotLabel:{
    type: Array,
    default: []
  }   // 热门标签
})

module.exports = mongoose.model('Label', LabelSchema)