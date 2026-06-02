# Venture Charts KOL 回测包

这个文件夹是 `@venture_charts` 的独立研究与回测工作区。以后每个 KOL 都可以按同样结构建一个单独文件夹。

## 目录结构

- `venture_charts_study.md`：学习笔记、策略规则、复盘结论
- `scripts/collect-venture-charts.mjs`：抓取 Venture Charts 官网公开资料
- `scripts/replay-venture-charts-events.mjs`：把公开观点事件化，并用 BTC/ETH 日线复盘
- `scripts/build-venture-strategy-dashboard.mjs`：按偏多事件买入，生成 K 线标注 HTML
- `output/`：资料索引、行情缓存、复盘结果、HTML 图表

## 运行顺序

在仓库根目录或 `venture` 目录外运行都可以，脚本会自动写入本文件夹的 `output`：

```bash
node venture/scripts/collect-venture-charts.mjs
node venture/scripts/replay-venture-charts-events.mjs
node venture/scripts/build-venture-strategy-dashboard.mjs
```

最终看这个文件：

```text
venture/output/venture_strategy_dashboard.html
```

## 复用到其他 KOL

建议结构：

```text
kol_name/
  README.md
  kol_name_study.md
  scripts/
    collect.mjs
    replay-events.mjs
    build-dashboard.mjs
  output/
```

核心原则：

- 每个 KOL 的原始资料、事件定义、行情缓存、HTML 输出都留在自己的文件夹。
- 共用脚本以后可以再抽到上层 `shared/`，但先保持每个 KOL 独立，方便快速迭代。
- 事件必须保留来源链接、触发条件、目标、失效条件，避免把主观总结混成无法复盘的信号。
