module.exports = (success, error) => {
  if(typeof error !== 'function'){
    error = () => {
      console.log('Error:', error)
    }
  }

  const mongoose = require('mongoose')
  const timezonePlugin = require('../plugin/timezonePlugin')
  mongoose.plugin(timezonePlugin)
  const {DBHOST,DBPORT,DBNAME,DBUSER,DBPASS} = require('../config/index')

  // 支持 MongoDB 认证
  let uri = `mongodb://${DBHOST}:${DBPORT}/${DBNAME}`
  const options = {}
  if (DBUSER && DBPASS) {
    uri = `mongodb://${encodeURIComponent(DBUSER)}:${encodeURIComponent(DBPASS)}@${DBHOST}:${DBPORT}/${DBNAME}?authSource=admin`
  }

  mongoose.connect(uri, options)

  mongoose.connection.once('open', success)

  mongoose.connection.on('error', error)

  mongoose.connection.on('close', () => {
    console.log('连接关闭')
  })
}