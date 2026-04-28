# Cloudflare Pages 上传和救援指南

这个项目按“单人自用、尽量免费、Direct Upload 上传压缩包”的方式维护。线上数据存在 Cloudflare KV，前台公开读取，写入、导入、恢复、修改密码都需要管理员密码。

## 1. Direct Upload 部署

在本地项目目录运行：

```powershell
npm test
npm run build
npm run package:direct
npm run smoke:direct
```

然后到 Cloudflare Pages 的项目后台，使用 Direct Upload 上传 `release` 目录里最新的 zip 包。

zip 根目录应该类似：

```text
favicon.svg
index-xxxx.js
index-xxxx.css
index.html
_headers
_worker.js
```

不要出现：

```text
assets/index-xxxx.js
assets/index-xxxx.css
```

如果 JS/CSS 回到 `assets/` 目录，Direct Upload 搭配 `_worker.js` 可能再次出现页面空白或一直停在加载中的问题。

## 2. Cloudflare 必需配置

KV binding：

```text
STARTPAGE_KV
```

环境变量：

```text
ADMIN_TOKEN
```

`ADMIN_TOKEN` 是最底层的救援密码。即使你在页面里设置了新的在线管理员密码，`ADMIN_TOKEN` 仍然可以用来登录和重设在线密码。

## 3. 健康诊断

上传后打开：

```text
https://你的-pages域名/api/health
```

重点看这些字段：

```json
{
  "ok": true,
  "version": "0.0.x",
  "worker": true,
  "kvBound": true,
  "adminTokenConfigured": true,
  "adminPasswordSource": "env 或 kv",
  "dashboardExists": true
}
```

常见判断：

- `kvBound: false`：Pages 没有绑定 `STARTPAGE_KV`。
- `adminTokenConfigured: false`：没有设置 `ADMIN_TOKEN` 环境变量。
- `worker: false` 或 `/api/health` 404：`_worker.js` 没有上传到 zip 根目录。
- 版本号不是刚打包的版本：Cloudflare 还在旧部署，重新上传或等待部署完成。

## 4. 忘记在线管理员密码

在线管理员密码保存在 KV 的 `admin:credential`，是哈希后的结果，不能反查明文。

忘记在线密码时：

1. 用 Cloudflare Pages 环境变量里的 `ADMIN_TOKEN` 登录页面。
2. 进入编辑模式。
3. 在“修改管理员密码”里重新设置在线密码。
4. 按需要选择“本次会话”或“记住此设备”。

如果在线密码配置异常，仍然可以用 `ADMIN_TOKEN` 作为救援密码。`ADMIN_TOKEN` 不能在网页里修改，需要去 Cloudflare Pages 后台的环境变量里改。

极端情况下，如果你确认要清除在线密码配置，可以在 Cloudflare KV 里删除：

```text
admin:credential
```

删除后页面会回到只使用 `ADMIN_TOKEN` 的登录方式。

## 5. 备份恢复

保存、导入、恢复前都会尽量把上一版 dashboard 写成 KV 备份：

```text
backup:<timestamp>
```

恢复备份前建议：

1. 进入编辑模式。
2. 打开“备份/恢复”。
3. 先点“下载 JSON”保存目标备份或当前数据。
4. 点击“恢复”后查看页面内的“当前数据 vs 备份数据”对比。
5. 确认分组数、网站数、更新时间都符合预期后，再点“确认恢复”。

恢复前系统会自动把当前线上 dashboard 再保存为一份新备份，方便误操作后回退。

## 6. 页面空白排查

如果首页空白或一直显示加载中：

1. 打开 `/api/health`，确认 Worker、KV、版本号正常。
2. 打开浏览器开发者工具，查看 `index-xxxx.js` 和 `index-xxxx.css` 是否 200。
3. 检查 Direct Upload zip，确认 JS/CSS 在 zip 根目录，不在 `assets/` 目录。
4. 确认 zip 里有 `_worker.js` 和 `_headers`。
5. 重新运行 `npm run package:direct` 和 `npm run smoke:direct` 后再上传。

## 7. 数据互通提醒

Pages 版和 Chrome 插件版的数据目标是通用的：都使用同一套 dashboard JSON 结构。需要迁移时，优先使用页面里的导出/导入功能，不要直接手写 KV 内容。
