// jobs/dailyBlindBox.js
const cron = require('node-cron')
const { restorePreviousBlindBoxes, generateDailyBlindBoxes } = require('../services/blindBoxService')

cron.schedule('20 8 * * *', async () => {
  console.log('开始处理盲盒刷新...')
  try {
    // 1. 恢复昨天未购买盲盒的库存
    await restorePreviousBlindBoxes()
    // 2. 生成今天的新盲盒
    await generateDailyBlindBoxes()
  } catch (err) {
    console.error('盲盒刷新失败:', err)
  }
})