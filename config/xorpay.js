module.exports = {
  appid: process.env.XORPAY_APPID || '请替换为你的 appid',
  appSecret: process.env.XORPAY_APPSECRET || '请替换为你的 app_secret',
  notifyUrl: process.env.XORPAY_NOTIFY_URL || '请替换为你的回调地址',
  api: {
    pay: process.env.XORPAY_API_PAY || 'https://xorpay.com/api/pay',
    query: process.env.XORPAY_API_QUERY || 'https://xorpay.com/api/query2',
    refund: process.env.XORPAY_API_REFUND || 'https://xorpay.com/api/refund'
  }
}
