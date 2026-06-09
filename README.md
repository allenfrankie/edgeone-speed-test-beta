# EdgeOne Speed Test (Beta)

基于腾讯云 EdgeOne Pages 边缘节点的网络测速工具。纯静态前端 + Edge Functions，导入即可部署。

## 功能

- **延迟 / 抖动**：多次采样取最优值与抖动
- **下载测速**：多路并发流式下载，实时仪表盘
- **上传测速**：多路并发 POST 上传
- **测速历史**：本地保存最近 20 条记录
- **连接信息**：边缘区域、协议、浏览器识别
- 深色科技风 UI，响应式，移动端适配

## 目录结构

```
edgeone-speed-test-beta/
├── index.html            # 主页面
├── css/style.css         # 样式
├── js/speedtest.js       # 测速引擎
└── functions/api/        # EdgeOne Edge Functions
    ├── ping.js           # GET  /api/ping     延迟探测
    ├── download.js       # GET  /api/download 下载数据源
    └── upload.js         # POST /api/upload   上传接收端
```

## 部署到 EdgeOne Pages

1. 在 EdgeOne 控制台 → Pages → 新建项目 → 从 Git 仓库导入
2. 选择本仓库 `edgeone-speed-test-beta`
3. 构建配置：
   - **框架预设**：无 / Static
   - **构建命令**：留空
   - **输出目录**：`/`（根目录）
4. 部署完成后，`functions/api/*` 会自动映射为 `/api/*` 边缘函数

无需任何构建步骤，开箱即用。

## 本地预览

静态资源可直接用任意 HTTP 服务器预览（`/api/*` 需在 EdgeOne 环境下才生效）：

```bash
npx serve .
```

## 说明

测速结果受浏览器、网络环境、边缘节点负载影响，数据仅供参考。
