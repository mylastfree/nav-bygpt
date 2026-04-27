# Nav ByGPT Pages

单人自用的网址导航页。前端部署到 Cloudflare Pages，数据保存到 Cloudflare KV，适合把 Chrome 启动页设置成自己的在线网址站。

这个版本和 Chrome 插件版使用同一套核心数据结构，JSON 可以互相导出、导入。区别是：Pages 版部署在公网，读取公开，所有保存、导入、恢复、检测等写入或维护操作都继续由 `ADMIN_TOKEN` 保护。

## 适合谁

- 想把 Chrome 启动页变成个人网址导航页的人
- 想用 Cloudflare Pages + KV 免费托管个人导航数据的人
- 想从 Chrome 插件版、iTab 或 JSON 备份迁移网址的人
- 想用最少后端、无注册、单人自用方式维护网址站的人

## 不适合谁

- 需要多人账号和权限管理
- 需要公开注册或 SaaS 平台
- 需要团队协作、审计流或复杂权限
- 需要无密码公网编辑

## 功能

- 左侧显示分组，点击分组后只显示该分组的网站
- 移动端分组横向滚动，电脑端左侧竖列显示
- 网站卡片显示 favicon、网站名称、网址和点击次数
- 网站卡片尺寸偏大，适合作为首页快捷入口
- 支持搜索当前分组或全部分组
- 支持新增、修改、删除、排序分组
- 支持新增、修改、删除、拖拽排序网站
- 编辑模式下 hover 才显示编辑、删除小图标
- 支持网站卡片多选、批量移动、批量删除、批量清空自定义图标
- 支持最近一次操作撤销
- 支持浅色、深色、跟随系统主题
- 支持舒适卡片、紧凑卡片、列表模式
- 支持背景预设、背景强度和分组颜色
- 支持导出 JSON 备份
- 支持导入本程序 JSON 和 iTab `.itabdata`
- 导入前显示预览，支持合并导入或覆盖当前数据
- 导入文件限制 10MB，最多 500 个分组、5000 个网站，单个分组最多 1000 个网站，避免误导入超大数据
- 覆盖导入会提示当前数量、覆盖后数量和减少数量，空导入会二次确认
- 保存、导入和恢复前自动保留 KV 备份
- 编辑模式可查看 KV 备份列表并恢复指定备份
- 支持恢复最近非空备份，降低误保存空数据后的恢复成本
- 支持重复网址高亮、定位、编辑、删除、打开和批量整理
- 支持受保护的批量网址检测，检测结果需要手动保存后才写入 KV
- 数据结构兼容 Chrome 插件版导出的主题、布局、点击次数、分组颜色和检测状态

## 技术路线

- React + TypeScript + Vite
- Cloudflare Pages Direct Upload
- `public/_worker.js` 提供 Pages Functions/Worker API
- Cloudflare KV 保存 `dashboard` 和 `backup:<timestamp>`
- `STARTPAGE_KV` 作为 KV binding 变量名
- `ADMIN_TOKEN` 环境变量控制写入和维护权限

## 本地开发

安装依赖：

```powershell
npm install
```

启动纯前端开发服务器：

```powershell
npm run dev
```

这个模式没有 Cloudflare Worker，页面会退回浏览器 `localStorage`，方便先调 UI。

验证 Cloudflare Worker 和 KV 绑定：

```powershell
npm run cf:dev
```

本地 `cf:dev` 会先构建，再用 Wrangler 启动 Pages dev，并使用 `dev-secret` 作为本地管理员密码。

## 打包成 Cloudflare Pages 上传包

```powershell
npm run package:direct
```

打包结果会出现在 `release/` 目录，例如：

```text
release/cf-startpage-direct-upload-YYYYMMDD_HHMMSS.zip
release/cf-startpage-direct-upload-YYYYMMDD_HHMMSS.zip.sha256
```

这个 zip 用于 Cloudflare Pages 的 Direct Upload。当前正确结构是 JS/CSS 位于 zip 根目录，不在 `assets/` 目录：

```text
favicon.svg
index-xxxx.css
index-xxxx.js
index.html
_headers
_worker.js
```

如果看到下面这种结构，不要上传，需要重新检查构建配置：

```text
assets/index-xxxx.css
assets/index-xxxx.js
```

项目依赖 `vite.config.ts` 里的 `base: './'` 和打包脚本来保持这个结构。之前 Direct Upload 搭配 `_worker.js` 时，`/assets/index-xxx.js` 可能被错误返回成 `index.html`，页面会空白或一直停在“我的导航正在加载”。

## Cloudflare Pages 上传部署

1. 进入 Cloudflare Dashboard。
2. 打开 `Workers & Pages`。
3. 创建 Pages 项目，选择 Direct Upload / Upload assets。
4. 上传 `release/cf-startpage-direct-upload-*.zip`。
5. 第一次部署后，进入项目设置，添加 KV binding：

```text
Variable name: STARTPAGE_KV
KV namespace: 选择你的 KV namespace
```

6. 添加环境变量：

```text
Variable name: ADMIN_TOKEN
Value: 一串足够长的随机密码
```

7. 重新上传同一个 zip，生成新部署，让 binding 和环境变量在部署里生效。

注意：KV binding 名必须是 `STARTPAGE_KV`。如果旧文档或旧部署里出现 `NAV_KV`，不要继续使用它。

## API

公开读取：

```http
GET /api/dashboard
```

管理员保存：

```http
PUT /api/dashboard
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

管理员读取备份列表：

```http
GET /api/backups
Authorization: Bearer <ADMIN_TOKEN>
```

管理员恢复备份：

```http
POST /api/backups/restore
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

管理员批量检测网址：

```http
POST /api/link-check
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

KV key：

```text
dashboard
backup:<timestamp>
```

## 数据备份和迁移

编辑模式里点击“导出”可以下载完整 JSON 备份。这个 JSON 可以在 Pages 版和 Chrome 插件版之间互相导入。

导入支持两种模式：

- 合并导入：跳过已有重复网址，只增加新网址。
- 覆盖当前全部数据：用导入文件替换当前导航数据。

导入也支持 iTab 的 `.itabdata` 文件。程序会把 iTab 分组转换成本程序分组，把 iTab 文件夹展开成独立分组，只保留 `http` / `https` 网址，`chrome://`、`itab://` 这类内部地址会在导入预览里跳过。

每次保存、导入和恢复前，Worker 会尽量把上一版 `dashboard` 自动保存为 KV 备份。备份列表只在管理员编辑模式里显示，恢复操作也需要管理员密码。

自动备份不是离线备份。重要调整前仍建议手动点“导出”，保存一份 JSON 文件。

## Chrome 启动页设置

```text
Chrome 设置 -> 启动时 -> 打开特定网页或一组网页 -> 添加 Cloudflare Pages 网址
```

这样每次打开 Chrome 时会进入导航站。如果要让“新建标签页”也自动打开导航页，需要使用 Chrome 插件版。

## 验证

每次改动后至少运行：

```powershell
npm test
npm run build
npm run package:direct
```

打包后确认 zip 里只有 Pages 运行需要的文件，不要包含 `node_modules/`、`src/`、`release/`、`.git/` 或 `.superpowers/`。
