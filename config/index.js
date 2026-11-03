const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET 未配置或长度不足 32 位，拒绝启动。请在 .env 中设置随机密钥。')
}

module.exports = {
  DBHOST: process.env.DB_HOST || '127.0.0.1',
  DBPORT: parseInt(process.env.DB_PORT, 10) || 27017,
  DBNAME: process.env.DB_NAME || 'SchoolShop',
  DBUSER: process.env.DB_USER || '',
  DBPASS: process.env.DB_PASS || '',
  secret: jwtSecret
}