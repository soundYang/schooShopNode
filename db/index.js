module.exports = (success, error) => {
  if(typeof error !== 'function'){
    error = () => {
      console.log('Error:', error)
    }
  }

  const mongoose = require('mongoose')
  const {DBHOST,DBPORT,DBNAME} = require('../config.js/index')

  mongoose.connect(`mongodb://${DBHOST}:${DBPORT}/${DBNAME}`)

  mongoose.connection.once('open', success)

  mongoose.connection.on('error', error)

  mongoose.connection.on('close', () => {
    console.log('连接关闭')
  })
}