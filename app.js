// 必须在最顶部加载 .env 文件
require('dotenv').config()

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan')
const helmet = require('helmet')

logger.token('date-utc8', function () {
  var date = new Date();
  var cst = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return cst.toISOString().replace('Z', '+08:00');
});
const rateLimit = require('express-rate-limit')
const cors = require('cors')

const UserRouter = require('./routes/user')
const ProductRouter = require('./routes/Product')
const AddressRouter = require('./routes/Address')
const OrderRouter = require('./routes/Order')
const ReviewRouter = require('./routes/Review')
const LabelRouter = require('./routes/Label')
const blindBox = require('./routes/BlindBox')
const NotificationRouter = require('./routes/Notification')
const AdminRouter = require('./routes/Admin')
const CaptchaRouter = require('./routes/Captcha')
const LogRouter = require('./routes/Log')
const logService = require('./ToolFunction/logService')
require('./jobs/orderTimeout')
// const PayRouter = require('./routes/Pay')
// const PayWebhookRouter = require('./routes/PayWebhook')

var app = express()

// 信任代理（Nginx 反代需要）
app.set('trust proxy', 1)

// 安全响应头
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}))

// CORS 白名单 — 部署时替换为实际前端域名
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'
app.use(cors({
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(','),
  credentials: true
}))

// 提供静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// 确保 uploads 目录存在
const fs = require('fs')
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads')
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { code: 429, msg: '请求过于频繁，请稍后再试' }
})
app.use('/login', limiter)

app.use(express.json({ limit: '15mb' }))
app.use(express.urlencoded({ extended: true, limit: '15mb' }))

const requestLogExclude = ['/captcha', '/uploads']
app.use((req, res, next) => {
  const start = Date.now()
  const excluded = requestLogExclude.some(p => req.path.startsWith(p))
  if (excluded) return next()

  res.on('finish', () => {
    if (res.statusCode < 400) return
    logService.error(`${req.method} ${req.path}`, `状态码: ${res.statusCode}`, req.path, req.method)
  })
  next()
})

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger(':method :url :status :response-time ms - :res[content-length] :date-utc8'));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/user', UserRouter)
app.use('/product', ProductRouter)
app.use('/address', AddressRouter)
app.use('/order', OrderRouter)
app.use('/review', ReviewRouter)
app.use('/label', LabelRouter)
app.use('/blindBox', blindBox)
app.use('/notification', NotificationRouter)
app.use('/admin', AdminRouter)
app.use('/captcha', CaptchaRouter)
app.use('/log', LogRouter)
// app.use('/pay', PayRouter)
// app.use('/', PayWebhookRouter)

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler — 生产环境不泄露错误详情
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  if (req.app.get('env') !== 'development') {
    return res.status(err.status || 500).json({
      code: err.status || 500,
      msg: '服务器内部错误'
    })
  }

  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
