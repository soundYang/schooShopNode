const Trie = require('sensitive-word-filtering')

const trie = new Trie()

const sensitiveWords = [
  '暴力', '赌博', '毒品', '枪支', '弹药', '爆炸', '杀人', '诈骗',
  '色情', '裸聊', '一夜情', '约炮', '迷药', '窃听', '定位器',
  '代考', '代写论文', '办证', '发票', '信用卡套现',
  '传销', '洗钱', '走私', '假货', '盗版',
  '反动', '邪教', '恐怖',
  '微信号', 'qq号', 'QQ号', '微信',
  '兼职刷单', '刷信誉', '刷单',
  '赌场', '时时彩',
  '违禁品', '管制刀具',
  '假钞', '假币', '伪造',
  '黑客', '破解', '外挂'
]

sensitiveWords.forEach(word => trie.insert(word))

const phoneReg = /1[3-9]\d{9}/g
const urlReg = /https?:\/\/(?!localhost|127\.0\.0\.1)[^\s/$.?#].[^\s]*/gi

function scanText(text) {
  const hits = []
  if (!text) return hits

  const filtered = trie.filter({ text, ignoreCase: true, ignoreSpaces: true })
  if (filtered !== text) {
    const cleanText = text.replace(/\s/g, '').toLowerCase()
    for (const word of sensitiveWords) {
      if (cleanText.includes(word)) {
        hits.push(word)
      }
    }
  }

  const lower = text.toLowerCase()
  const phones = lower.match(phoneReg)
  if (phones) {
    hits.push(...phones.map(p => '手机号:' + p))
  }
  const urls = lower.match(urlReg)
  if (urls) {
    hits.push(...urls.map(u => '外链:' + u))
  }

  return [...new Set(hits)]
}

function contentModeration(options = {}) {
  const {
    checkFields = ['shopName', 'shopMsg', 'content'],
    blockOnHit = true
  } = options

  return async (req, res, next) => {
    try {
      const allHits = []
      let hitField = ''

      for (const field of checkFields) {
        const value = req.body[field]
        if (value && typeof value === 'string') {
          const fieldHits = scanText(value)
          if (fieldHits.length > 0) {
            allHits.push(...fieldHits)
            hitField = field
          }
        }
      }

      if (allHits.length > 0) {
        if (blockOnHit) {
          return res.status(400).json({
            code: 400,
            msg: '内容包含不当信息，请修改后重试',
            hitField
          })
        }

        req.moderation = {
          passed: false,
          reason: '命中敏感词: ' + [...new Set(allHits)].join(', '),
          hitWords: [...new Set(allHits)],
          needsReview: true
        }
        return next()
      }

      req.moderation = { passed: true, needsReview: false }
      next()
    } catch (err) {
      req.moderation = { passed: true, needsReview: false }
      next()
    }
  }
}

module.exports = { contentModeration, scanText }
