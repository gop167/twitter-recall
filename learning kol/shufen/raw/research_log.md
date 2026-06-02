# 采集日志

## 已完成

- 已创建目录：`shufen/raw`、`shufen/notes`、`shufen/scripts`。
- 已确认目标 X 账号公开画像：`@shufen46250836`，简介为“努力进化，早日发财| 所有观点非财务建议”，TwStalker 显示约 2K tweets、72K followers、86 following、679 likes。
- 已通过 TwStalker 读取到最近若干复盘帖和详情页。
- 已通过搜索确认 `FPS` 指向 Forgent Power Solutions，是数据中心/电网/工业设施电气配电设备公司，NYSE 代码 `FPS`。

## 限制

- 本地命令行直接访问 `twiscan.com` 被连接重置。
- 本地命令行访问 `twstalker.com` 超时。
- Node 在该环境中访问部分 HTTPS 站点时遇到自签名证书链或 ECONNRESET。
- X 官方页面在未登录或无 API 权限下通常无法完整导出 2K 条历史帖。
- 因此，本次目录内保存的是“可确认样本 + 方法论抽取 + 可复跑脚本”，不是完整 2K 条历史推文镜像。

## 后续补全建议

1. 如果本机 Chrome 已登录 X，可手动导出目标账号时间线 HTML，然后用 `scripts/collect_shufen.mjs --from-file saved.html` 提取。
2. 如果有 X API 或第三方数据源，可以把原始 JSON 放到 `raw/` 下，再用相同规则库继续归类。
3. 每次补充资料后，优先更新 `notes/rules.md` 的规则证据和 `notes/replay.md` 的标的复盘。

