var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan')
const rateLimit = require('express-rate-limit')

const UserRouter = require('./routes/user')
const ProductRouter = require('./routes/Product')
const AddressRouter = require('./routes/Address')
const OrderRouter = require('./routes/Order')
const ReviewRouter = require('./routes/Review')

var app = express()

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 分钟
  max: 10,                     // 每个 IP 最多 10 次请求
  message: { code: 429, msg: '请求过于频繁，请稍后再试' }
})
app.use('/login', limiter)     // 仅对登录接口限流

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/user', UserRouter)
app.use('/product', ProductRouter)
app.use('/address', AddressRouter)
app.use('/order', OrderRouter)
app.use('/review', ReviewRouter)

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
