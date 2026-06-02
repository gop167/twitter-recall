# shufen 研究目录

采集时间：2026-06-02，时区：Asia/Shanghai。

目标账号：

- X: https://x.com/shufen46250836
- TwStalker 镜像: https://twstalker.com/shufen46250836
- TwiScan 镜像: https://twiscan.com/x/shufen46250836

## 文件说明

- `raw/user_supplied_material.md`: 用户提供的原文样本。
- `raw/source_urls.txt`: 资料源 URL 清单。
- `raw/twstalker_recent_samples.md`: 本次能确认的公开样本摘录与来源。
- `raw/shufen_level_events.json`: 明确价位、提及标的、Futu 代码映射和来源。
- `raw/research_log.md`: 采集过程、限制和复跑建议。
- `notes/rules.md`: 从样本中抽取出的投研规则、信号和风控约束。
- `notes/replay.md`: 对主要观点、标的和方法论的复盘。
- `notes/checklists.md`: 后续学习/回测时可直接使用的检查清单。
- `scripts/collect_shufen.mjs`: 无第三方依赖的采集脚本，支持从网页 URL 或本地 HTML 提取文本样本。
- `scripts/build_shufen_kline_replay.mjs`: 使用 Futu OpenD 拉日 K 并生成价位回测图表。
- `output/shufen_kline_replay.html`: K 线价位回测图。
- `output/shufen_kline_replay.md`: 回测摘要。
- `output/shufen_kline_replay.csv`: 明细表。

## 当前结论一句话

shufen 的核心不是单纯荐股，而是先判断市场版本和资金风格，再沿着大科技财报、资本开支、产能瓶颈和产业链外溢去找“铲子”，最后用量能、叙事、财报催化和仓位纪律做交易窗口管理。

## 复跑 K 线回测

确保 Futu OpenD 正在本机运行后执行：

```powershell
node .\shufen\scripts\build_shufen_kline_replay.mjs
```

默认参数：

- `FUTU_HOST=127.0.0.1`
- `FUTU_PORT=11111`
- `FUTU_PYTHON=py`
- `KTYPE=K_DAY`
- `AUTYPE=NONE`
- `END_DATE=2026-06-02`
