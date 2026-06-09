# EdgeOne Speed Test (Beta)

基于腾讯云 EdgeOne Pages 边缘节点的网络测速工具。纯静态前端 + Edge Functions，导入即可部署。

## 功能

- **延迟 / 抖动**：多次采样取最优值与抖动
- **下载测速**：多路并发拉取静态不可压缩二进制，XHR onprogress 统计真实到达字节
- **上传测速**：多路并发 POST 随机数据，XHR upload.onprogress 统计真实发出字节
- **测速历史**：本地保存最近 20 条记录
- **连接信息**：边缘区域、协议、浏览器识别
- 深色科技风 UI，响应式，移动端适配

## 测速原理

- 测量的是 **浏览器 ↔ 离你最近的 EdgeOne 边缘节点(POP)** 这一段链路，不回源站。
- **下载**：循环拉取 `assets/random10mb.bin`（10MB 随机字节，gzip 后反而更大，无法被传输压缩“作弊”加速）。由 EdgeOne 当静态资源直传，真实占用网卡带宽。
- **上传**：用 `crypto.getRandomValues` 生成不可压缩随机数据 POST 给边缘函数 `/api/upload`。
- 两端均设 **1.5s 预热**，跳过 TCP 慢启动，只统计稳定窗口的速率。

## 目录结构

```
edgeone-speed-test-beta/
├── index.html              # 主页面
├── css/style.css           # 样式
├── js/speedtest.js         # 测速引擎（XHR）
├── assets/
│   └── random10mb.bin      # 10MB 静态随机文件（下载源）
└── functions/api/          # EdgeOne Edge Functions
    ├── ping.js             # GET  /api/ping     延迟探测
    └── upload.js           # POST /api/upload   上传接收端
```

## 部署到 EdgeOne Pages

1. 在 EdgeOne 控制台 → Pages → 新建项目 → 从 Git 仓库导入
2. 选择本仓库 `edgeone-speed-test-beta`
3. 构建配置：
   - **框架预设**：无 / Static
   - **构建命令**：留空
   - **输出目录**：`/`（根目录）
4. 部署完成后，`functions/api/*` 会自动映射为 `/api/*` 边缘函数，`assets/*` 作为静态资源直传

无需任何构建步骤，开箱即用。

## 本地预览

静态资源可直接用任意 HTTP 服务器预览（`/api/*` 需在 EdgeOne 环境下才生效）：

```bash
npx serve .
```

## 说明

测速结果受浏览器、网络环境、边缘节点负载影响，数据仅供参考。
