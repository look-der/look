/**
 * 站点配置文件
 * ------------------------------------------------------------------
 * 想改什么，先看这里：
 *  1. 改后台密码：⚠️ 公开部署请用环境变量 ADMIN_PASSWORD 设置，不要把明文写进本文件（会被提交到仓库）。
 *  2. 改端口：设置环境变量 PORT，或改下面的 port。
 *  3. 增删分类栏目：改下面的 categories 数组（id 用于数据关联，name 用于展示）。
 *  4. 放开/收紧可上传的文件类型、大小：改 allowedExt / maxFileSize。
 */
const path = require('path');

const ROOT = __dirname;
// 持久化根目录：本地开发默认即项目根；部署到容器平台（Railway/Render/Fly 等）时，
// 把持久卷挂载到某目录（如 /data），再用环境变量 DATA_ROOT=/data 指向它，
// 数据与上传文件即可持久化、重启不丢。
const DATA_ROOT = process.env.DATA_ROOT || ROOT;

const config = {
  // 服务端口（部署时可改）
  port: process.env.PORT || 3000,

  // 管理后台密码：⚠️ 公开部署务必用环境变量 ADMIN_PASSWORD，不要在代码里留明文！
  // 本地开发启动示例：ADMIN_PASSWORD=1578875641 npm start
  adminPassword: process.env.ADMIN_PASSWORD || 'change-me-2026',

  // 数据文件（所有作品都记在这里）
  // 数据文件（所有作品记录）：挂在 DATA_ROOT 下，便于部署时持久化到卷
  dataFile: path.join(DATA_ROOT, 'data', 'projects.json'),

  // 前端静态目录
  publicDir: path.join(ROOT, 'public'),

  // 上传文件落盘目录（对外以 /uploads 访问）
  // 上传文件落盘目录（对外以 /uploads 访问）：挂在 DATA_ROOT 下，便于部署时持久化到卷
  uploadDir: path.join(DATA_ROOT, 'public', 'uploads'),

  // 允许上传的文件类型（按扩展名，小写）
  allowedExt: [
    '.dwg', '.dxf',            // CAD 图纸
    '.pdf',                    // 计算书 / 文档
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff', // 图片/预览
    '.zip',                    // 打包素材
    '.doc', '.docx', '.xlsx', '.pptx' // 办公文档
  ],

  // 单个文件最大 50MB（可按需调整）
  maxFileSize: 50 * 1024 * 1024,

  // 分类栏目：可随时增删。id 建议用英文短名，name 为中文展示名
  categories: [
    { id: 'building-design', name: '建筑结构设计', desc: '课程设计、毕业设计、方案设计等结构类综合作品' },
    { id: 'cad-drawings',    name: 'CAD 图纸',     desc: 'AutoCAD 等导出的施工图、平面 / 立面 / 剖面图' },
    { id: 'calculation',     name: '计算书与分析', desc: '结构计算书、有限元分析、PKPM / YJK 等分析结果' }
  ]
};

module.exports = config;
