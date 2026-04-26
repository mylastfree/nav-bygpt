# Changelog

## 0.0.1 - 2026-04-27

- 同步 Chrome 插件版的数据结构扩展，支持点击统计、链接检测状态、分组颜色、卡片布局和壁纸设置。
- 增加通用导入解析能力，支持本程序 JSON 和 iTab `.itabdata`，并限制导入文件大小与链接数量。
- 增加重复网址、导入预览、合并导入、批量删除重复项和备份摘要等维护数据 helper。
- 强化 `sanitizeDashboard`，导入时自动补默认值并重建重复或缺失的分组/链接 ID。
- 更新 Cloudflare Pages Worker 保存校验，使扩展字段可以安全写入 `STARTPAGE_KV`，同时继续保留 `ADMIN_TOKEN` 写入保护。
