const mongoose = require('mongoose')

const LabelSchema = new mongoose.Schema({
  mainLabel: {
    type: Object,
    default: { name: '主标签', items: [] }
  },
  attributeLabel: {
    type: Object,
    default: { name: '属性标签', items: [] }
  },
  hotLabel: {
    type: Object,
    default: { name: '热门标签', items: [] }
  }
})

module.exports = mongoose.model('Label', LabelSchema)