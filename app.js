var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan')

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
// const PayRouter = require('./routes/Pay')
// const PayWebhookRouter = require('./routes/PayWebhook')

var app = express()
app.use(cors())

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
// app.use('/pay', PayRouter)
// app.use('/', PayWebhookRouter)

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
