const fs = require('fs')
const path = require('path')
const { checkText } = require('./baiduModeration')
const Trie = require('sensitive-word-filtering')

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
  '黑客', '破解', '外挂',
  '傻逼', '傻B', 'sb', 'SB', '傻叉', '脑残', '弱智', '智障',
  '妈的', '他妈', '操你', '草你', '日你', '你妈', '尼玛', '你麻痹',
  '废物', '垃圾', '白痴', '蠢货', '狗日的', '王八', '龟孙',
  '操蛋', '滚蛋', '去死', '变态', '贱人', '婊子',
  'fuck', 'shit', 'bitch', 'asshole', 'damn',
  'fxxk', 'f**k', 's.h.i.t', 'b.i.t.c.h'
]

const phoneReg = /1[3-9]\d{9}/g
const urlReg = /https?:\/\/(?!localhost|127\.0\.0\.1)[^\s/$.?#].[^\s]*/gi

const trie = new Trie({
  ignoreCase: true,
  ignoreSpaces: true
})

for (const word of sensitiveWords) {
  trie.insert(word.toLowerCase())
}

try {
  const enPath = path.join(__dirname, '..', 'node_modules', 'sensitive-word-filtering', 'en.txt')
  if (fs.existsSync(enPath)) {
    const enContent = fs.readFileSync(enPath, 'utf-8')
    enContent.split(/\r?\n/).forEach(w => {
      const trimmed = w.trim().toLowerCase()
      if (trimmed) trie.insert(trimmed)
    })
    console.log(`[本地词库] 已加载 ${enContent.split(/\r?\n/).filter(w => w.trim()).length} 个英文敏感词`)
  }
} catch (e) {
  console.warn('[本地词库] 加载英文敏感词失败:', e.message)
}

function scanWithTrie(text) {
  if (!text) return []

  let normalizedText = text
  if (trie.ignoreSpaces) {
    normalizedText = normalizedText.replace(/\s+/g, '')
  }
  if (trie.ignoreCase) {
    normalizedText = normalizedText.normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  }

  const chars = Array.from(normalizedText)
  let found = false
  for (let i = 0; i < chars.length; i++) {
    let node = trie.root
    let j = i
    while (j < chars.length && node.children[chars[j]]) {
      node = node.children[chars[j]]
      if (node.isEndOfWord) {
        found = true
        break
      }
      j++
    }
    if (found) break
  }

  if (!found) return []

  const hits = []
  const lower = text.toLowerCase()
  const phones = lower.match(phoneReg)
  if (phones) {
    for (const p of phones) hits.push('手机号:' + p)
  }
  const urls = lower.match(urlReg)
  if (urls) {
    for (const u of urls) hits.push('外链:' + u)
  }

  return hits.length > 0 ? hits : ['内容包含不当信息']
}

async function scanText(text) {
  if (!text) return []

  const localHits = scanWithTrie(text)
  if (localHits.length > 0) {
    console.log(`[本地词库] 命中敏感词: ${localHits.join(', ')}，跳过百度审核`)
    return localHits
  }

  const baiduResult = await checkText(text)
  if (baiduResult.passed) {
    return []
  }

  return baiduResult.hitWords.length > 0 ? baiduResult.hitWords : ['百度审核异常，需人工复审']
}

function contentModeration(options = {}) {
  const {
    checkFields = ['shopName', 'shopMsg', 'content'],
    checkImages = true,
    autoFlagImages = false,
    blockOnHit = true
  } = options

  return async (req, res, next) => {
    try {
      const allHits = []
      let hitField = ''

      for (const field of checkFields) {
        const value = req.body[field]
        if (value && typeof value === 'string') {
          const fieldHits = await scanText(value)
          if (fieldHits.length > 0) {
            allHits.push(...fieldHits)
            hitField = field
          }
        }
      }

      const hasImages = req.files && req.files.length > 0

      if (allHits.length > 0) {
        if (blockOnHit) {
          return res.status(400).json({
            code: 400,
            msg: `内容包含不当信息，请修改后重试`,
            hitField
          })
        }

        req.moderation = {
          passed: false,
          reason: `命中敏感词: ${allHits.join(', ')}`,
          hitWords: [...new Set(allHits)],
          needsReview: true
        }
        return next()
      }

      if (checkImages && autoFlagImages && hasImages) {
        req.moderation = {
          passed: true,
          reason: '包含图片，等待管理员审核',
          hitWords: [],
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
