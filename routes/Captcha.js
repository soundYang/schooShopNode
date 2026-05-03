const express = require('express')
const svgCaptcha = require('svg-captcha')
const crypto = require('crypto')
const captchaStore = require('../ToolFunction/captchaStore')
const router = express.Router()

router.get('/', (req, res) => {
  // 随机使用数学表达式或文字验证码，增加 OCR 难度
  const useMath = Math.random() > 0.5
  let captcha
  if (useMath) {
    captcha = svgCaptcha.createMathExpr({
      mathMin: 10,
      mathMax: 50,
      mathOperator: '+',
      noise: 4,
      color: true,
      background: '#f0f4f8',
      fontSize: 52,
      width: 160,
      height: 50
    })
  } else {
    captcha = svgCaptcha.create({
      size: 5,
      ignoreChars: '0o1il',
      noise: 4,
      color: true,
      background: '#f0f4f8',
      fontSize: 52,
      width: 160,
      height: 50
    })
  }

  const captchaId = crypto.randomUUID()
  captchaStore.set(captchaId, captcha.text)

  res.json({
    code: 200,
    data: {
      captchaId,
      svg: captcha.data,
      type: useMath ? 'math' : 'text'
    }
  })
})

module.exports = router
