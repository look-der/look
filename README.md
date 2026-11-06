# 作品集展示网站（简历补充材料）

一个为简历面试准备的**设计作品展示站**：把你的 CAD 图纸、结构计算书、设计方案等分类展示，并支持通过后台随时自行上传、扩充内容。带 Node 后端，浏览器内即可真实上传与管理文件。

---

## 一、目录结构

```
portfolio-site/
├── package.json          # 依赖与启动脚本
├── config.js             # ★ 配置中心：端口 / 后台密码 / 分类栏目 / 允许的文件类型
├── server.js             # Node(Express) 后端：静态托管 + 上传 + 作品增删改查 API
├── Dockerfile            # 容器镜像构建（部署用）
├── .dockerignore         # 构建镜像时的排除项
├── render.yaml           # Render 一键部署配置（含持久磁盘）
├── .gitignore
├── data/
│   └── projects.json     # ★ 所有作品数据（相当于“数据库”，自动维护）
├── README.md
└── public/               # 前端
    ├── index.html        # 展示首页（hero / 关于 / 作品网格 / 详情弹窗）
    ├── admin.html        # 管理后台（登录 + 上传 + 管理）
    ├── uploads/          # 上传文件落盘处（按分类分目录，.gitignore 已忽略）
    │   └── .gitkeep
    └── assets/
        ├── css/style.css
        └── js/
            ├── main.js   # 展示页逻辑
            └── admin.js  # 后台逻辑
```

---

## 二、本地运行

```bash
cd portfolio-site
npm install        # 安装 express / multer
npm start          # 启动服务
```

启动后访问：
- 展示首页： http://localhost:3000/
- 管理后台： http://localhost:3000/admin.html

> 首次运行请务必修改 `config.js` 里的 `adminPassword`（或设置环境变量 `ADMIN_PASSWORD`）。默认密码是 `change-me-2026`。

---

## 三、如何新增 / 管理作品（重点）

1. 打开 `/admin.html`，输入后台密码登录。
2. 填写：标题、分类栏目、日期、一句话简介、标签、详细说明。
3. 点击“上传文件”区域，选中图纸 / 计算书 / 源文件（可多选，也支持拖拽）。
   - 上传的图片会自动作为封面；
   - DWG / PDF / 文档等会显示为可下载的附件。
4. 点“提交作品”，即归入所选分类，首页立刻可见。
5. 在下方“已有作品”列表里可随时**编辑**（追加或移除文件、改说明）或**删除**。

整个过程**无需改代码、无需重启服务**。

---

## 四、常见自定义

| 需求 | 怎么做 |
| --- | --- |
| 改分类栏目 | 编辑 `config.js` 的 `categories` 数组（增删条目即可，前端自动同步） |
| 改后台密码 | 改 `config.js` 的 `adminPassword`，或设环境变量 `ADMIN_PASSWORD` |
| 改端口 | 改 `config.js` 的 `port`，或设环境变量 `PORT` |
| 放开更多文件类型 | 在 `config.js` 的 `allowedExt` 里加上扩展名（如 `.rvt`、`.skp`） |
| 改网站文案 / 姓名 | 直接编辑 `public/index.html` 里的 Hero 与“关于我”段落 |
| 改配色 | 编辑 `public/assets/css/style.css` 顶部 `:root` 变量 |

---

## 五、部署上线（让所有人都能访问）

本站带 Node 后端，需部署到「能运行 Node 的容器平台」。已为你准备好 **Dockerfile** 与 **render.yaml**，任选一种方式即可。无论哪种，**数据与上传文件都通过持久磁盘保存（重启不丢）**。

### 方式 A：Render（最易上手，推荐）

> **当前仓库里的 `render.yaml` 是「展示版（方案 A）」**：不挂持久磁盘，服务直接读取仓库内已提交的内容（`data/projects.json` + `public/uploads/`，含本次新增的 CAD 示例项目），线上与本地展示完全一致。代价：后台新上传的作品在实例重启后会丢失，仅适合「展示」用途。
>
> 若要改为「上传持久化」版本：在 `render.yaml` 的 `envVars` 加回 `- key: DATA_ROOT  value: /data`，并在 `services` 下加回 `disks: - name: portfolio-data  mountPath: /data  sizeGB: 1` 即可。

1. 把 `portfolio-site/` 整个目录推送到 GitHub / GitLab 仓库。
2. 登录 [render.com](https://render.com) → **New** → **Blueprint** → 选择该仓库。
3. Render 会自动读取 `render.yaml`，创建 Web 服务。**展示版（当前默认）不挂磁盘**，服务读取仓库内置数据；若按上方提示改回带 `DATA_ROOT=/data` 的配置，则会挂载 1GB 持久磁盘（挂到 `/data`）。
4. 在控制台 **Environment** 里给 `ADMIN_PASSWORD` 填一个**强密码**（必填，否则后台谁都能登）。
5. 部署完成后，Render 给你一个 `https://xxxx.onrender.com` 域名，所有人可访问。
   - 展示页：`/`，后台：`/admin.html`。
   - ⚠️ free 计划会休眠（约 15 分钟无访问后睡，下次访问有数秒冷启动）；要常驻可升级 starter（付费）。

### 方式 B：Railway
1. 推送代码到 Git 仓库，登录 [railway.app](https://railway.app) → **New Project** → 导入仓库。
2. Railway 自动用 Dockerfile 构建。在 **Variables** 添加 `ADMIN_PASSWORD`（强密码）与 `DATA_ROOT=/data`。
3. 在 **Volumes** 创建一个卷并挂载到 `/data`（否则重启丢数据）。
4. 生成域名后即可公开访问。Railway 按用量计费（新账号有赠送额度）。

### 方式 C：Fly.io（免费额度友好）
1. 安装 `flyctl`，`fly launch`（自动识别 Dockerfile）。
2. `fly volumes create portfolio_data --size 1` 创建持久卷。
3. 在 `fly.toml` 设 `env.DATA_ROOT = "/data"` 并把卷挂到 `/data`（仓库已留挂载说明）。
4. `fly deploy` 上线，分配 `.fly.dev` 域名。

### 方式 D：自有 VPS / 云服务器
1. 上传代码，`npm install --omit=dev`。
2. 用 pm2 守护：`npm i -g pm2 && pm2 start server.js --name portfolio`。
3. 用 Nginx 反代到 `localhost:3000` 并配置 HTTPS（Let's Encrypt）。
4. 同样设置 `ADMIN_PASSWORD` 与（可选）`DATA_ROOT` 指向数据盘。

### 必须做的安全项
- **强密码**：上线前务必设 `ADMIN_PASSWORD`（12 位以上、字母数字符号混合），当前 `config.js` 里的 `1578875641` 偏弱。
- 后台 `/admin.html` 与展示页一同公开，任何人可尝试登录——强密码是第一道防线。
- 公网开放上传：建议在 `config.js` 把 `maxFileSize`（默认 50MB）与 `allowedExt` 按需求收紧，降低被滥用风险。

### 关于持久化（重要）
平台容器文件系统是临时的，重启 / 重新部署会清空 `data/` 与 `uploads/`。
- **展示版（当前 `render.yaml` 默认）**：不设 `DATA_ROOT`，服务读取仓库内置的 `data/projects.json` 与 `public/uploads/`（已被 `.dockerignore` 的例外规则打进镜像），所以**已提交的作品（含 CAD 示例）上线即见**，但后台新上传内容重启会丢。
- **持久化版**：用环境变量 `DATA_ROOT` 把数据与上传目录指向**持久磁盘**（如 Render `/data`，Railway/Fly 同理）。该模式下初次部署磁盘为空，需在 `/admin.html` 手动添加第一个作品，之后所有新增内容落在持久卷上，重启不丢。

> 若只想纯静态托管（GitHub Pages 等），当前结构不直接适用，需改为“拖文件进文件夹 + 手动编辑 projects.json”的静态方案，可让我帮你转换。

---

## 六、接口速览（供进阶使用）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/categories | 获取分类列表 |
| GET | /api/projects?category=xxx | 获取作品（可按分类筛选） |
| GET | /api/projects/:id | 获取单个作品 |
| POST | /api/login | 后台登录，返回 token |
| POST | /api/projects | 新建作品（需 token + 文件） |
| PUT | /api/projects/:id | 更新作品（需 token） |
| DELETE | /api/projects/:id | 删除作品（需 token） |

---

由 WorkBuddy 智能设计助手搭建。
