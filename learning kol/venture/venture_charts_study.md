# Venture Charts 学习与复盘笔记

生成时间：2026-06-02  
研究对象：[@venture_charts](https://x.com/venture_charts) / [Venture Charts](https://venture-charts.com/)

## 资料范围

本轮已抓取官网公开 REST 内容，并生成资料索引：

- 文章：70 篇
- 页面：24 个
- 公开视频文件引用：36 个
- 公开文本检查后可读文章：34 篇
- X 匿名抓取：尝试失败，错误为 `ECONNRESET`，所以本轮不把 X 时间线当作完整样本

输出文件：

- `venture_charts_output/materials.json`：官网文章/页面原始结构化资料
- `venture_charts_output/materials.csv`：可筛选资料表
- `venture_charts_output/material-index.md`：资料统计摘要
- `venture_charts_output/event-replay.csv`：事件复盘结果
- `venture_charts_output/event-replay.md`：事件复盘 Markdown 摘要

## 一句话总结他的框架

他不是“指标派”，而是用高低周期结构、供需/价值区间、money flow、时间相位、跨市场同步性来做证据合成。核心口径是：先判断市场处于什么相位和结构位置，再决定上涨是趋势延续、反弹，还是做空机会。

公开材料里出现频率最高的概念：

- supply/demand、value、SR、pivot
- cycle、phase、synchronicity
- money flow、conditions、configuration
- correlated markets：USDT.D、DXY/EUR、USD/XAU、NAS/SPX/VIX/yields
- Fibonacci、pitchfork、1:1 extension 等只作为辅助工具

## 核心思路

1. 先看高周期处境。  
   如果高周期已经破坏，低周期反弹一般只当作反弹，不能直接当作牛市恢复。

2. 再看市场是否在 value 内部。  
   如果价格进入 value，但内部没有需求/供给拦截，价格容易一路走到 range extreme。

3. SR flip 是触发器，不是全部逻辑。  
   他经常提到 key SR、monthly resistance、internal SR、local demand。关键水平被翻转后，才有交易计划；没有翻转，多数只是观察。

4. money flow 决定条件变化。  
   money flow 正向时，可以允许更高目标；money flow 提前破坏时，即使价格还在高位，也要警惕顶部或失败反弹。

5. 时间相位很重要。  
   他反复用 phase、pivot date、synced low、ideal phased trough。价格到了关键位，但时间没走完，可能还要横盘或反复；时间和价格同时到位，信号更强。

6. 用相关市场加证据权重。  
   USDT.D 作为 BTC 反向确认，NAS/SPX/VIX/yields 作为风险资产环境确认。单个币的走势不能孤立看。

7. “sum of evidence” 大于单点信号。  
   供需、money flow、时间、相关市场、关键价位同时指向一个方向，才提高仓位和信心。

## 抽取出的交易规则

### 规则 1：高周期破坏后，低周期反弹优先按失败反弹处理

条件：

- 高周期已经破位，或某一 phase 已经向下破坏
- 价格反弹到 range high、supply、Fib extension、pitchfork 或关键 SR
- money flow 没有恢复，或相关市场给出风险提示

动作：

- 不追多
- 等反弹接近目标区后找失败信号
- 目标看回 range low 或下一需求区

公开案例：2026-03 到 2026-05 的 BTC 复盘，先允许反弹到 76k-80k/低中 80k，再转向中期顶部和 75k 下方目标。

### 规则 2：进入 value 后，如果中间没有需求/供给，价格倾向去 range extreme

条件：

- 价格翻入 value
- 内部 SR 或 local demand 没有守住
- 走势表现为快速穿越，而不是逐级吸收

动作：

- 不在 value 中间猜底/猜顶
- 等 range extreme 或明确 SR flip
- 目标用 range high/low，而不是随意设盈亏比

公开案例：TAO 宽幅区间、USDT.D 翻入 value 后看向更高区域、ETH 回到 range extreme 的推理。

### 规则 3：money flow 提前破坏，是高位风险信号

条件：

- 价格仍接近 ATH 或区间高位
- money flow 已提前断裂
- 下方缺少需求

动作：

- 多头减仓或不新开多
- 等关键支撑失守后转为空头计划
- 若重新 reclaim 关键支撑，才修正偏见

公开案例：2025-06-18 BTC，107k reclaim 才偏正面，100k 日收下破则看 mid-90k。

### 规则 4：SR flip + phase base 可以做反弹多，但只做战术目标

条件：

- 资产经历大幅洗盘或长期下跌
- 在 phase 内 basing
- 低周期首次出现积极结构
- SR 被翻成支撑

动作：

- 可以做 long trade
- 目标优先看下一个 supply / range high / extension
- 如果高周期仍空，只把它当 countertrend，不恋战

公开案例：2026-04-24 BTC/DOGE 的反弹计划，低周期转正但高周期仍提示后续风险。

### 规则 5：相关市场出现同步风险时，单币 bullish 信号降权

条件：

- BTC/ETH 内部结构还没完全破坏
- 但 NAS/SPX/VIX/yields 或 USDT.D 给出反向风险
- 市场进入历史易调整时间窗口

动作：

- 降低多头信心
- 反弹到位后优先观察 short setup
- 重要币种先破位时，把它视为 sector warning

公开案例：ETH 2026-05-12 破位后，他把它视为整个 crypto sector 的 warning，并外推到 BTC。

## 事件复盘结果

复盘脚本：`replay-venture-charts-events.mjs`  
行情数据：Binance BTCUSDT/ETHUSDT 日线  
复盘截止：2026-06-02  
说明：这是 swing-level 事件复盘，不是精确到发文分钟的交易执行回测。

结果：

- 定义事件：16 个
- 已触发/可评分事件：16 个
- 60 日内目标命中：7/16
- 平均 30 日方向修正收盘收益：0.17%
- 平均 60 日方向修正最大有利波动：14.26%

有效性较好的类型：

- 有明确条件触发的破位交易，例如 2025-06-18 BTC 跌破 100k 后看 mid-90k
- 高周期空头语境中的反弹失败，例如 2025-09-22、2026-01-31、2026-05-20
- 低周期转正后的战术目标，例如 2026-03-25 BTC 看 76k-80k

容易出问题的类型：

- 过早做空高位风险，例如 2025-07-06 提醒需求不足，但价格还能继续上冲
- 高周期空头里过早做多反弹，例如 2026-01-18 synced low 的 long idea 后续失败
- 目标设得很远的宏观空头，例如 2026-04-07 below 50k 仍在观察期，短期会被反弹折磨

## 可程序化规则

可以先程序化这几类：

1. 条件破位规则  
   例如日收跌破关键位后，回测未来 7/30/60 天是否到达目标。

2. range/value 规则  
   用 N 日高低点定义 range，价格进入中轴后，测试去两端 extreme 的概率。

3. SR flip 规则  
   用前 N 日高低点或成交密集区代理 SR，测试突破、回踩、再延续的胜率。

4. countertrend target 规则  
   高周期下跌中，低周期突破后只看到固定目标，测试不贪的效果。

5. 跨市场过滤规则  
   用 USDT.D、NASDAQ/SPX、VIX/yields 的方向作为 BTC/ETH 信号过滤器。

暂时不适合完全程序化的部分：

- 他图上的手动画线、Q/Y 等内部标记
- money flow 的主观形态判断
- phase/pivot date 的来源
- supply/demand zone 的人工识别

这些可以先用人工标注字段接入，而不是硬写成假精确指标。

## 每日复盘模板

1. 标高周期 range：range high、range low、value 中轴。
2. 标关键 SR：最近被市场尊重的水平，记录是否 flip。
3. 标时间：当前是否处于 pivot/phase/synced low 附近。
4. 判断 money flow：正向、破坏、还是中性。
5. 查相关市场：USDT.D、ETH、NASDAQ/SPX、VIX/yields 是否同步。
6. 写 bias：trend long、countertrend long、range trade、short setup、no trade。
7. 写触发条件：必须是 close above/below、reclaim、loss of level，不写模糊入场。
8. 写失效条件：如果触发后走错，在哪个价位承认错。
9. 复盘结果：目标是否命中、最大有利波动、最大不利波动、是否过早。

## 下一步

最有价值的下一步不是继续堆概念，而是补齐两类数据：

- 从 X 导出或镜像抓取更多原始推文，尤其是带图表的推文
- 人工标注每篇文章里的关键位、目标、失效位、相位判断

有了这些字段后，当前事件复盘脚本可以扩展成真正的 KOL 规则回测。
