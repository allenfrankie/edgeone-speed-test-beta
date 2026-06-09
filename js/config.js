/* ============================================================
 * 测速目标节点配置
 * ------------------------------------------------------------
 * EdgeOne Pages 是 anycast 单域名，浏览器侧无法强制命中某个
 * 地理节点 —— 默认 "auto" 永远走离你最近的边缘节点(POP)。
 *
 * 若要真正测「指定地区」的节点，唯一可靠的办法是：
 *   1. 在 EdgeOne 为不同地区分别绑定独立加速域名 / 站点；
 *   2. 把每个地区的域名按下面格式填进 targets 数组。
 * 选择器切换后，全部请求(ping/download/upload)都会打到该域名。
 *
 * 跨域目标需要对应站点开启 CORS（本项目 _headers 已为 /assets/*
 * 和 functions 设置 Access-Control-Allow-Origin: *）。
 * ============================================================ */
window.SPEEDTEST_TARGETS = [
  {
    id: 'auto',
    label: '自动 · 就近节点',
    region: 'EdgeOne Anycast',
    // 空 base = 相对路径，走当前部署的就近节点
    download: 'assets/random10mb.bin',
    upload: '/api/upload',
    ping: '/api/ping',
  },

  // ====== 以下为自定义地区节点示例（默认注释，按需启用）======
  // 填入你在 EdgeOne 为各地区绑定的独立加速域名即可：
  //
  // {
  //   id: 'sh', label: '华东 · 上海', region: '上海',
  //   download: 'https://sh.your-domain.com/assets/random10mb.bin',
  //   upload:   'https://sh.your-domain.com/api/upload',
  //   ping:     'https://sh.your-domain.com/api/ping',
  // },
  // {
  //   id: 'gz', label: '华南 · 广州', region: '广州',
  //   download: 'https://gz.your-domain.com/assets/random10mb.bin',
  //   upload:   'https://gz.your-domain.com/api/upload',
  //   ping:     'https://gz.your-domain.com/api/ping',
  // },
  // {
  //   id: 'hk', label: '中国香港', region: 'Hong Kong, China',
  //   download: 'https://hk.your-domain.com/assets/random10mb.bin',
  //   upload:   'https://hk.your-domain.com/api/upload',
  //   ping:     'https://hk.your-domain.com/api/ping',
  // },
];
