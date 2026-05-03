module.exports = {
  DBHOST: process.env.DB_HOST || '127.0.0.1',
  DBPORT: parseInt(process.env.DB_PORT, 10) || 27017,
  DBNAME: process.env.DB_NAME || 'SchoolShop',
  secret: process.env.JWT_SECRET || 'REDACTED_DEFAULT_SECRET'
}