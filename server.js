/**
 * 展示型网站后端服务
 * ------------------------------------------------------------------
 * 职责：
 *  - 托管 public/ 下的静态页面（展示页 + 管理后台）
 *  - 提供作品数据接口（增 / 删 / 改 / 查）
 *  - 接收文件上传，按分类落盘到 public/uploads/<category>/
 *  - 用一份 projects.json 作为“数据库”，无需额外数据库
 *
 * 运行：npm install && npm start  →  http://localhost:3000
 */
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const app = express();
app.use(express.json());

// ---------- 目录与数据准备 ----------
[path.dirname(config.dataFile), config.uploadDir].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(config.dataFile, 'utf8'));
  } catch (e) {
    return { projects: [] };
  }
}
function saveData(data) {
  fs.writeFileSync(config.dataFile, JSON.stringify(data, null, 2), 'utf8');
}
let data = loadData();

// ---------- 鉴权 ----------
// 后台登录后拿到的 token，写操作都需带上。token 由密码派生，改密码即改 token。
const ADMIN_TOKEN = Buffer.from('portfolio::' + config.adminPassword).toString('base64');
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (auth === 'Bearer ' + ADMIN_TOKEN) return next();
  return res.status(401).json({ error: '未授权，请先登录后台' });
}

// ---------- 工具函数 ----------
function sanitizeName(name) {
  // 保留中英文、数字、下划线、短横、点；其余替换为下划线
  return name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').slice(0, 80);
}
function extOf(name) {
  return path.extname(name).toLowerCase();
}
function isAllowed(name) {
  return config.allowedExt.includes(extOf(name));
}
function catDir(catId) {
  const dir = path.join(config.uploadDir, catId || 'misc');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function fileType(ext) {
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff'].includes(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.dwg' || ext === '.dxf') return 'cad';
  if (ext === '.doc' || ext === '.docx') return 'doc';
  if (ext === '.xlsx' || ext === '.pptx') return 'office';
  if (ext === '.zip') return 'zip';
  return 'file';
}

// ---------- 文件上传（multer） ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, catDir(req.body.category)),
  filename: (req, file, cb) => {
    const base = sanitizeName(path.parse(file.originalname).name);
    const ext = extOf(file.originalname);
    const stamp = Date.now().toString(36);
    cb(null, `${base}_${stamp}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSize, files: 30 },
  fileFilter: (req, file, cb) => {
    if (isAllowed(file.originalname)) return cb(null, true);
    cb(new Error('不支持的文件类型：' + extOf(file.originalname) + '（请在 config.js 的 allowedExt 中添加）'));
  }
});

// ---------- 静态资源 ----------
app.use(express.static(config.publicDir));
// 兼容 uploadDir 不位于 publicDir 之下的情况（如挂载持久卷部署）：无论 uploads 在哪都通过 /uploads 提供
app.use('/uploads', express.static(config.uploadDir));

// ---------- 公开接口 ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/categories', (req, res) => res.json(config.categories));

app.get('/api/projects', (req, res) => {
  let list = data.projects;
  if (req.query.category) list = list.filter((p) => p.category === req.query.category);
  res.json(list);
});

app.get('/api/projects/:id', (req, res) => {
  const p = data.projects.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: '未找到该作品' });
  res.json(p);
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (password === config.adminPassword) return res.json({ ok: true, token: ADMIN_TOKEN });
  res.status(401).json({ error: '密码错误' });
});

// ---------- 受保护接口（需后台登录） ----------
// 新建作品（可同时上传多个文件）
app.post('/api/projects', requireAuth, upload.array('files', 30), (req, res) => {
  try {
    const { title, category, summary, description, tags, date } = req.body;
    if (!title || !category) return res.status(400).json({ error: '标题和分类为必填项' });
    if (!config.categories.some((c) => c.id === category)) {
      return res.status(400).json({ error: '分类不存在，请在 config.js 中确认' });
    }
    const files = (req.files || []).map((f) => ({
      name: f.originalname,
      url: '/uploads/' + category + '/' + f.filename,
      type: fileType(extOf(f.originalname)),
      size: f.size
    }));
    const coverImage = files.find((f) => f.type === 'image');
    const project = {
      id: 'p' + Date.now().toString(36),
      title: String(title).trim(),
      category,
      summary: (summary || '').trim(),
      description: (description || '').trim(),
      tags: String(tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      date: (date || '').trim() || new Date().toISOString().slice(0, 10),
      cover: coverImage ? coverImage.url : '',
      files
    };
    data.projects.unshift(project);
    saveData(data);
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 更新作品（可追加文件 / 删除指定文件 / 改元数据）
app.put('/api/projects/:id', requireAuth, upload.array('files', 30), (req, res) => {
  try {
    const p = data.projects.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: '未找到该作品' });
    const { title, category, summary, description, tags, date, cover, removeFiles } = req.body;
    if (title !== undefined) p.title = String(title).trim();
    if (category !== undefined) p.category = category;
    if (summary !== undefined) p.summary = (summary || '').trim();
    if (description !== undefined) p.description = (description || '').trim();
    if (tags !== undefined)
      p.tags = String(tags)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    if (date !== undefined) p.date = (date || '').trim();
    if (cover !== undefined) p.cover = cover;

    // 删除指定文件
    let toRemove = [];
    try {
      toRemove = JSON.parse(removeFiles || '[]');
    } catch (e) {
      /* ignore */
    }
    if (toRemove.length) {
      toRemove.forEach((url) => {
        try {
          fs.unlinkSync(path.join(config.uploadDir, url.replace(/^\/uploads\//, '')));
        } catch (e) {
          /* ignore */
        }
      });
      p.files = (p.files || []).filter((f) => !toRemove.includes(f.url));
    }

    // 追加新上传的文件
    const newFiles = (req.files || []).map((f) => ({
      name: f.originalname,
      url: '/uploads/' + (category || p.category) + '/' + f.filename,
      type: fileType(extOf(f.originalname)),
      size: f.size
    }));
    if (newFiles.length) p.files = (p.files || []).concat(newFiles);

    // 若没有封面且有图片，自动补一张
    if (!p.cover && (p.files || []).some((f) => f.type === 'image')) {
      p.cover = p.files.find((f) => f.type === 'image').url;
    }
    saveData(data);
    res.json(p);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除作品（连同其文件）
app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const idx = data.projects.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '未找到该作品' });
  const p = data.projects[idx];
  (p.files || []).forEach((f) => {
    try {
      fs.unlinkSync(path.join(config.uploadDir, f.url.replace(/^\/uploads\//, '')));
    } catch (e) {
      /* ignore */
    }
  });
  data.projects.splice(idx, 1);
  saveData(data);
  res.json({ ok: true });
});

// ---------- 错误处理（如文件类型超限） ----------
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

// 仅当直接运行 `node server.js` 时才监听端口；被 require 时（如测试）只导出 app
if (require.main === module) {
  app.listen(config.port, () => {
    console.log('==================================================');
    console.log(' 展示网站已启动');
    console.log(' 展示首页 : http://localhost:' + config.port + '/');
    console.log(' 管理后台 : http://localhost:' + config.port + '/admin.html');
    console.log(' 后台密码 : ' + (config.adminPassword === 'change-me-2026' ? '（默认，请尽快在 config.js 修改）' : '已在配置中设置'));
    console.log('==================================================');
  });
}

module.exports = app;
