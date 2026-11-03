# 校园二手交易平台 · 后端 API

基于 Express + MongoDB 的校园二手交易后端，提供用户、商品、订单、盲盒、评价、通知、内容审核和管理后台等接口。

前端仓库：[soundYang/SchoolShopVue](https://github.com/soundYang/SchoolShopVue)

## 功能模块

### 用户与鉴权

- 注册、登录、图形验证码
- JWT 鉴权，`tokenVersion` 实现单点登录与主动失效
- 个人资料、头像、密码修改
- 管理员账号使用 bcrypt 存储密码

### 商品

- 发布商品（最多 6 张图）、编辑、删除 / 下架
- 商品列表、详情、关键词搜索、标签检索
- 本地图片上传，静态资源通过 `/uploads` 提供

### 订单

- 订单状态机：`0` 待付款、`1` 已付款待发货、`2` 已发货待收货、`3` 已完成、`4` 已取消、`5` 退款中
- 买家 / 卖家订单列表与详情
- 下单时原子扣减库存，取消 / 退款时回滚
- 余额支付
- 定时任务每 30 秒检查一次，未支付普通订单超过 30 分钟自动取消并恢复库存

### 盲盒

- 6 档价格池：`0.99 / 6.99 / 9.99 / 19.9 / 39.9 / 69.9`
- 每位用户每天最多生成 4 个盲盒
- 商品种类超过 150 时开放，低于 80 时关闭
- 按价格 ±50% 的范围匹配商品实际价值
- 每天 8:20 执行定时任务：恢复前一日未购买盲盒库存并生成当日盲盒
- 未支付的盲盒订单在次日刷新时自动取消并恢复库存

### 内容审核

- 本地敏感词 Trie 过滤
- 可选的百度文本 / 图片审核
- 审核队列与管理员复核
- 违规内容按规则处理

### 其他

- 通知列表、未读数、已读
- 收货地址管理
- 商品标签管理
- 操作日志与登录日志
- 健康检查：`GET /health`
- 管理后台接口：数据概览、用户 / 商品 / 订单 / 审核 / 日志管理

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 运行时 | Node.js + Express 4 |
| 数据库 | MongoDB + Mongoose 9 |
| 缓存 | Redis + ioredis（可选，未连接时直接查库） |
| 鉴权 | JWT + bcrypt |
| 上传 | Multer |
| 定时任务 | node-cron + setInterval |
| 内容审核 | 本地敏感词 Trie + 百度内容审核（可选） |
| 安全与性能 | Helmet、CORS 白名单、express-rate-limit、compression |
| 包管理 | pnpm |

## 目录结构

```text
app.js              # Express 入口、中间件与路由挂载
bin/www             # 启动入口、数据库连接、优雅关闭
config/             # 配置与 JWT_SECRET 校验
db/                 # MongoDB 连接
model/              # Mongoose 数据模型
routes/             # 业务路由
middlewares/        # 鉴权、内容审核
services/           # 盲盒等业务逻辑
jobs/               # 订单超时、每日盲盒定时任务
ToolFunction/       # Redis、日志、验证码、脱敏等工具
scripts/            # 数据脚本
```

## 快速开始

### 环境要求

- Node.js 20+
- MongoDB 6+
- Redis（可选；未启动时自动跳过缓存）
- pnpm

### 安装与启动

```bash
cp .env.example .env
# 编辑 .env，至少填写 JWT_SECRET 和 MongoDB 连接信息
pnpm install
pnpm start
```

服务默认监听 `3000` 端口。

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | 服务端口，默认 `3000` |
| `NODE_ENV` | 否 | `development` / `production` |
| `DB_HOST` | 否 | MongoDB 地址，默认 `127.0.0.1` |
| `DB_PORT` | 否 | MongoDB 端口，默认 `27017` |
| `DB_NAME` | 否 | 数据库名，默认 `SchoolShop` |
| `DB_USER` | 否 | MongoDB 用户名 |
| `DB_PASS` | 否 | MongoDB 密码 |
| `JWT_SECRET` | **是** | 至少 32 位随机字符串；缺失或过短时服务拒绝启动 |
| `REDIS_HOST` | 否 | Redis 地址，默认 `127.0.0.1` |
| `REDIS_PORT` | 否 | Redis 端口，默认 `6379` |
| `REDIS_PASSWORD` | 否 | Redis 密码 |
| `BAIDU_APP_ID` | 否 | 百度内容审核 App ID |
| `BAIDU_API_KEY` | 否 | 百度内容审核 API Key |
| `BAIDU_SECRET_KEY` | 否 | 百度内容审核 Secret Key |
| `XORPAY_APPID` | 否 | Xorpay 配置（预留，支付路由当前未启用） |
| `XORPAY_APPSECRET` | 否 | Xorpay 配置（预留） |
| `XORPAY_NOTIFY_URL` | 否 | Xorpay 回调地址（预留） |
| `CORS_ORIGIN` | 否 | 允许的前端域名，多个用逗号分隔；默认 `*` |
| `SEED_ADMIN_PASSWORD` | 否 | 开发环境种子管理员密码，至少 12 位 |

生成随机 JWT 密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 初始化管理员

仅开发环境可用，且需要先配置 `SEED_ADMIN_PASSWORD`（至少 12 位）：

```bash
curl -X POST http://127.0.0.1:3000/admin/seed
```

接口会创建用户名为 `admin` 的超级管理员，不返回明文密码。`NODE_ENV=production` 时该接口直接禁用。

## API 概览

| 前缀 | 说明 |
| --- | --- |
| `/user` | 注册、登录、资料、密码 |
| `/product` | 商品发布、列表、搜索、编辑、删除 |
| `/order` | 下单、买卖家订单、状态流转、取消、退款 |
| `/blindBox` | 每日盲盒、购买、开盒、历史记录 |
| `/review` | 商品评价 |
| `/address` | 收货地址 |
| `/label` | 商品标签 |
| `/notification` | 通知 |
| `/admin` | 管理后台接口 |
| `/captcha` | 图形验证码 |
| `/log` | 日志查询 |
| `/health` | 健康检查 |

## 部署建议

- 使用 PM2 托管进程：

```bash
pnpm install --prod
pm2 start bin/www --name school-shop-api
```

- Nginx 将前端 `/api/` 反向代理到本服务，`uploads/` 目录需要可写并持久化。
- 生产环境把 `CORS_ORIGIN` 设置为实际前端域名，不要保留 `*`。
- 服务已开启 `trust proxy`，可正确获取代理后的客户端 IP。
- 定时任务随进程启动：订单超时任务只在 `pm_id=0` 或单进程时执行；盲盒任务未做多实例去重，生产环境建议单实例部署，或自行保证只在一个实例运行。

## 安全说明与已知限制

- `.env` 已被 gitignore，任何情况下不要提交真实密钥。
- `JWT_SECRET` 必须配置且不少于 32 位，否则服务拒绝启动。
- 种子管理员接口仅在非生产环境可用，并要求至少 12 位密码。
- 用户密码目前沿用历史实现的无盐 MD5，生产环境建议迁移到 bcrypt / argon2。
- 支付相关路由当前未挂载，仅支持余额支付；Xorpay 配置为预留项。
- 暂未接入自动化测试与 CI。
- 本项目为个人学习与作品展示项目。
