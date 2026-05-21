const fs = require('fs')

let client = null

function getClient() {
  if (client) return client

  const appId = process.env.BAIDU_APP_ID
  const apiKey = process.env.BAIDU_API_KEY
  const secretKey = process.env.BAIDU_SECRET_KEY

  if (!appId || !apiKey || !secretKey) {
    console.warn('[百度审核] 未配置 BAIDU_APP_ID / BAIDU_API_KEY / BAIDU_SECRET_KEY，审核功能不可用')
    return null
  }

  try {
    const BaiduAipSdk = require('baidu-aip-sdk')
    const AipContentCensorClient = BaiduAipSdk.contentCensor
    client = new AipContentCensorClient(appId, apiKey, secretKey)
    console.log('[百度审核] 客户端初始化成功')
  } catch (err) {
    console.error('[百度审核] 初始化失败:', err.message)
  }

  return client
}

const PASSTHROUGH = { passed: true, details: [], reason: '' }

async function checkText(text) {
  const c = getClient()
  if (!c) return { passed: true, hitWords: [], reason: '' }
  try {
    const result = await c.textCensorUserDefined(text)
    const conclusion = result.conclusion
    if (conclusion === '合规') return { passed: true, hitWords: [], reason: '' }
    const hitWords = (result.data || []).map(d => d.msg).filter(Boolean)
    return {
      passed: false,
      hitWords: hitWords.length > 0 ? hitWords : ['疑似违规'],
      reason: hitWords.length > 0 ? hitWords.join('; ') : `百度审核: ${conclusion}`
    }
  } catch (err) {
    console.error('[百度审核] 文本审核请求失败:', err.message)
    return { passed: false, hitWords: ['百度审核异常，需人工复审'], reason: err.message }
  }
}

async function moderateImagesAsync(files) {
  const c = getClient()
  if (!c) return PASSTHROUGH
  for (const file of files) {
    try {
      const imageData = fs.readFileSync(file.path)
      const base64Data = imageData.toString('base64')
      const result = await c.imageCensorUserDefined(base64Data, 'base64')
      const conclusion = result.conclusion
      if (conclusion !== '合规') {
        const details = (result.data || []).map(d => d.msg).filter(Boolean)
        return {
          passed: false,
          reason: details.length > 0 ? details.join('; ') : `百度审核: ${conclusion}`,
          details
        }
      }
    } catch (err) {
      console.error('[百度审核] 图片审核请求失败:', file.originalname || file.filename, err.message)
      return { passed: false, reason: '百度图片审核异常，需人工复审', details: ['百度审核异常'] }
    }
  }
  return PASSTHROUGH
}

module.exports = { checkText, moderateImagesAsync }
