# Twitter token backtest

运行：

```powershell
.\run.ps1
```

输出在 `output/`。优先打开：

- `dashboard.html`: 新版主视图。每个代币一张 4H K线图，橙色菱形和“喊1/喊2”就是他喊完后落到的K线位置；下面用中文写清楚发推时间、图上落点、1天/7天/30天表现。
- 配图也会下载到 `output/media/` 并用本机 OCR 识别，识别出来的代币会在卡片里标为“配图OCR”。
- 首日K/TGE首日已排除，不画到K线上，也不参与平均收益。

其他文件：

- `metrics.csv`: 每条喊单后的 24H、7D、30D、30D最大/最小收益。
- `calls.csv`: 被识别为代币提及的推文列表。
- `tweets.json`、`media_ocr.json` 和 `raw_timeline.json`: 原始抓取、OCR缓存和推文数据，方便复核。

说明：

- 推文来自 X Web guest GraphQL 的 `UserTweets`，公开返回范围由 X 当前接口决定，不等价于完整历史归档。
- K线优先使用 Binance 4H；部分未上 Binance 的币使用 Gate 或 GeckoTerminal 的 4H 池子K线。
- 收益计算用发推后第一根 4H K线开盘价作为 entry。若推文早于代币上线，则用上线后第一根可用K线，并在 `delay_hours` 标出延迟。
