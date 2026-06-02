import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const KOL_DIR = path.resolve(BASE_DIR, "..");
const OUT_DIR = path.join(KOL_DIR, "output");
const EVENT_FILE = path.join(OUT_DIR, "event-replay.json");
const DASHBOARD_FILE = path.join(OUT_DIR, "venture_strategy_dashboard.html");
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HOLD_DAYS = 30;
const PLOTLY_CDN = "https://cdn.plot.ly/plotly-2.35.2.min.js";

function readText(filePath) {
  return fs.readFile(filePath, "utf8").then((text) => text.replace(/^\uFEFF/, ""));
}

async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

function normalizeRows(rows) {
  return rows.map((row) => ({
    time: Number(row[0]),
    date: new Date(Number(row[0])).toISOString().slice(0, 10),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
  }));
}

function pct(value, digits = 2) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-";
}

function money(value, digits = 2) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function candleIndexAtOrAfter(candles, date) {
  const target = Date.parse(`${date}T00:00:00Z`);
  return candles.findIndex((candle) => candle.time >= target);
}

function findNextRiskEvent(events, signal) {
  return events
    .filter((event) => event.symbol === signal.symbol && event.bias === "short")
    .filter((event) => Date.parse(`${event.entryDate ?? event.date}T00:00:00Z`) > Date.parse(`${signal.entryDate}T00:00:00Z`))
    .sort((a, b) => String(a.entryDate ?? a.date).localeCompare(String(b.entryDate ?? b.date)))[0];
}

function buildLongTrade(signal, allEvents, candles) {
  const entryIndex = candleIndexAtOrAfter(candles, signal.entryDate);
  if (entryIndex < 0) return null;

  const entry = candles[entryIndex];
  const deadlineTime = entry.time + MAX_HOLD_DAYS * DAY_MS;
  const timeExitIndex = candles.findIndex((candle, index) => index > entryIndex && candle.time >= deadlineTime);
  const fallbackExitIndex = timeExitIndex >= 0 ? timeExitIndex : candles.length - 1;
  const riskEvent = findNextRiskEvent(allEvents, signal);
  const riskIndex = riskEvent ? candleIndexAtOrAfter(candles, riskEvent.entryDate ?? riskEvent.date) : -1;
  const maxScanIndex = riskIndex > entryIndex ? Math.min(riskIndex, fallbackExitIndex) : fallbackExitIndex;

  let exit = candles[fallbackExitIndex];
  let exitPrice = exit.close;
  let exitReason = timeExitIndex >= 0 ? "30天时间退出" : "回测截止";
  let exitEvent = null;

  for (let i = entryIndex + 1; i <= maxScanIndex; i += 1) {
    const candle = candles[i];
    if (Number.isFinite(Number(signal.invalidation)) && candle.low <= Number(signal.invalidation)) {
      exit = candle;
      exitPrice = Number(signal.invalidation);
      exitReason = "失效位退出";
      break;
    }
    if (Number.isFinite(Number(signal.target)) && candle.high >= Number(signal.target)) {
      exit = candle;
      exitPrice = Number(signal.target);
      exitReason = "目标价止盈";
      break;
    }
  }

  if (exitReason === "30天时间退出" || exitReason === "回测截止") {
    if (riskIndex > entryIndex && riskIndex <= fallbackExitIndex) {
      exit = candles[riskIndex];
      exitPrice = exit.close;
      exitReason = "后续风险信号退出";
      exitEvent = riskEvent;
    }
  }

  const observed = candles.filter((candle) => candle.time >= entry.time && candle.time <= exit.time);
  const maxHigh = Math.max(...observed.map((candle) => candle.high));
  const minLow = Math.min(...observed.map((candle) => candle.low));
  const returnPct = exitPrice / entry.close - 1;
  const mfe = maxHigh / entry.close - 1;
  const mae = entry.close / minLow - 1;

  return {
    symbol: signal.symbol,
    title: signal.title,
    url: signal.url,
    entryDate: entry.date,
    entryPrice: entry.close,
    exitDate: exit.date,
    exitPrice,
    exitReason,
    returnPct,
    mfe,
    mae,
    target: Number(signal.target),
    invalidation: Number(signal.invalidation),
    holdDays: Math.max(0, Math.round((exit.time - entry.time) / DAY_MS)),
    exitEventTitle: exitEvent?.title ?? "",
  };
}

function buildTrades(events, candlesBySymbol) {
  return events
    .filter((event) => event.bias === "long")
    .map((event) => buildLongTrade(event, events, candlesBySymbol.get(event.symbol)))
    .filter(Boolean);
}

function buildStats(trades) {
  const returns = trades.map((trade) => trade.returnPct);
  const total = returns.reduce((equity, value) => equity * (1 + value), 1) - 1;
  const wins = returns.filter((value) => value > 0).length;
  const avg = returns.reduce((sum, value) => sum + value, 0) / (returns.length || 1);
  return {
    trades: trades.length,
    wins,
    winRate: trades.length ? wins / trades.length : 0,
    avg,
    total,
    best: returns.length ? Math.max(...returns) : 0,
    worst: returns.length ? Math.min(...returns) : 0,
  };
}

function chartForSymbol(symbol, candles, events, trades) {
  const symbolEvents = events.filter((event) => event.symbol === symbol);
  const symbolTrades = trades.filter((trade) => trade.symbol === symbol);
  return {
    symbol,
    candles: candles.map((candle) => ({
      t: candle.date,
      o: candle.open,
      h: candle.high,
      l: candle.low,
      c: candle.close,
    })),
    buyMarkers: symbolTrades.map((trade, index) => ({
      label: `买${index + 1}`,
      date: trade.entryDate,
      price: trade.entryPrice,
      title: trade.title,
      target: trade.target,
      invalidation: trade.invalidation,
      url: trade.url,
    })),
    exitMarkers: symbolTrades.map((trade, index) => ({
      label: `出${index + 1}`,
      date: trade.exitDate,
      price: trade.exitPrice,
      reason: trade.exitReason,
      result: pct(trade.returnPct),
      title: trade.title,
    })),
    riskMarkers: symbolEvents
      .filter((event) => event.bias === "short")
      .map((event, index) => ({
        label: `险${index + 1}`,
        date: event.entryDate ?? event.date,
        price: Number(event.entryPrice),
        title: event.title,
        target: Number(event.target),
        url: event.url,
      })),
    targetSegments: symbolTrades
      .filter((trade) => Number.isFinite(trade.target))
      .map((trade) => ({
        x0: trade.entryDate,
        x1: trade.exitDate,
        y: trade.target,
      })),
    invalidationSegments: symbolTrades
      .filter((trade) => Number.isFinite(trade.invalidation))
      .map((trade) => ({
        x0: trade.entryDate,
        x1: trade.exitDate,
        y: trade.invalidation,
      })),
  };
}

function buildHtml({ events, trades, stats, charts }) {
  const tradeRows = trades
    .map(
      (trade) => `<tr>
        <td>${escapeHtml(trade.symbol)}</td>
        <td>${escapeHtml(trade.entryDate)}</td>
        <td>${money(trade.entryPrice)}</td>
        <td>${escapeHtml(trade.exitDate)}</td>
        <td>${money(trade.exitPrice)}</td>
        <td class="${trade.returnPct >= 0 ? "pos" : "neg"}">${pct(trade.returnPct)}</td>
        <td>${pct(trade.mfe)}</td>
        <td>${pct(trade.mae)}</td>
        <td>${escapeHtml(trade.exitReason)}</td>
        <td><a href="${escapeHtml(trade.url)}" target="_blank" rel="noreferrer">${escapeHtml(trade.title)}</a></td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Venture Charts 策略买入回测标注</title>
  <script src="${PLOTLY_CDN}"></script>
  <style>
    :root {
      --bg: #f7f8fb;
      --panel: #ffffff;
      --text: #18212f;
      --muted: #657184;
      --line: #dce2ea;
      --buy: #16a34a;
      --exit: #2563eb;
      --risk: #dc2626;
      --warn: #d97706;
      --shadow: 0 12px 32px rgba(25, 35, 55, .08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
    }
    header {
      padding: 28px clamp(16px, 4vw, 44px) 18px;
      border-bottom: 1px solid var(--line);
      background: #ffffff;
    }
    h1 { margin: 0 0 8px; font-size: 28px; font-weight: 760; letter-spacing: 0; }
    .sub { color: var(--muted); line-height: 1.7; max-width: 1120px; }
    main { padding: 22px clamp(16px, 4vw, 44px) 44px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(6, minmax(130px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .stat, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .stat { padding: 14px 16px; }
    .stat span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 6px; }
    .stat strong { font-size: 22px; }
    .panel { margin-top: 18px; overflow: hidden; }
    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
      align-items: flex-end;
    }
    .panel-head h2 { margin: 0; font-size: 18px; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
    }
    .legend b { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
    .chart { height: 620px; width: 100%; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 700; background: #fbfcfe; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .pos { color: var(--buy); font-weight: 700; }
    .neg { color: var(--risk); font-weight: 700; }
    .notes {
      padding: 14px 18px 18px;
      color: var(--muted);
      line-height: 1.7;
      font-size: 13px;
    }
    @media (max-width: 980px) {
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .chart { height: 520px; }
      .panel-head { display: block; }
      .legend { margin-top: 10px; }
    }
    @media (max-width: 620px) {
      h1 { font-size: 22px; }
      .stats { grid-template-columns: 1fr; }
      .chart { height: 460px; }
      table { font-size: 12px; }
      th, td { padding: 8px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Venture Charts 策略买入回测标注</h1>
    <div class="sub">只回测公开材料中明确偏多的买入事件。买入价取事件日收盘；退出优先级为目标价命中、后续风险/看空信号、30 天时间退出或回测截止。红色风险信号只用于提示和退出，不在本报告里开空。</div>
  </header>
  <main>
    <section class="stats">
      <div class="stat"><span>买入交易</span><strong>${stats.trades}</strong></div>
      <div class="stat"><span>胜率</span><strong>${pct(stats.winRate)}</strong></div>
      <div class="stat"><span>平均收益</span><strong class="${stats.avg >= 0 ? "pos" : "neg"}">${pct(stats.avg)}</strong></div>
      <div class="stat"><span>复合收益</span><strong class="${stats.total >= 0 ? "pos" : "neg"}">${pct(stats.total)}</strong></div>
      <div class="stat"><span>最好一笔</span><strong class="pos">${pct(stats.best)}</strong></div>
      <div class="stat"><span>最差一笔</span><strong class="neg">${pct(stats.worst)}</strong></div>
    </section>

    ${charts
      .map(
        (chart, index) => `<section class="panel">
      <div class="panel-head">
        <h2>${escapeHtml(chart.symbol)} K线标注</h2>
        <div class="legend">
          <span><b style="background: var(--buy)"></b>买入</span>
          <span><b style="background: var(--exit)"></b>退出</span>
          <span><b style="background: var(--risk)"></b>风险/看空</span>
          <span><b style="background: var(--warn)"></b>目标/失效线</span>
        </div>
      </div>
      <div class="chart" id="chart-${index}"></div>
    </section>`,
      )
      .join("")}

    <section class="panel">
      <div class="panel-head"><h2>买入交易明细</h2></div>
      <div style="overflow:auto">
        <table>
          <thead>
            <tr>
              <th>标的</th><th>买入日</th><th>买入价</th><th>退出日</th><th>退出价</th><th>收益</th><th>MFE</th><th>MAE</th><th>退出原因</th><th>原始事件</th>
            </tr>
          </thead>
          <tbody>${tradeRows}</tbody>
        </table>
      </div>
      <div class="notes">MFE 是持仓期间最大有利波动，MAE 是最大不利波动。这个报告是规则学习用，不代表完整交易建议；很多 Venture 的核心判断来自图上手动画线、phase/pivot date 和 money flow 形态，本轮只把公开文字里能落地的事件规则程序化。</div>
    </section>
  </main>
  <script>
    const charts = ${JSON.stringify(charts)};
    const colors = {
      up: "#059669",
      down: "#dc2626",
      buy: "#16a34a",
      exit: "#2563eb",
      risk: "#dc2626",
      target: "#d97706",
      grid: "#e8edf4",
      text: "#18212f"
    };

    function renderChart(chart, index) {
      const el = document.getElementById("chart-" + index);
      const candle = {
        type: "candlestick",
        x: chart.candles.map(c => c.t),
        open: chart.candles.map(c => c.o),
        high: chart.candles.map(c => c.h),
        low: chart.candles.map(c => c.l),
        close: chart.candles.map(c => c.c),
        increasing: { line: { color: colors.up }, fillcolor: colors.up },
        decreasing: { line: { color: colors.down }, fillcolor: colors.down },
        name: chart.symbol
      };
      const buys = {
        type: "scatter",
        mode: "markers+text",
        x: chart.buyMarkers.map(m => m.date),
        y: chart.buyMarkers.map(m => m.price),
        text: chart.buyMarkers.map(m => m.label),
        textposition: "top center",
        marker: { color: colors.buy, size: 13, symbol: "triangle-up", line: { color: "#064e3b", width: 1 } },
        customdata: chart.buyMarkers.map(m => [m.title, m.target || "-", m.invalidation || "-", m.url]),
        hovertemplate: "<b>%{text}</b><br>%{customdata[0]}<br>买入: %{x}<br>价格: %{y:.2f}<br>目标: %{customdata[1]}<br>失效: %{customdata[2]}<extra></extra>",
        name: "买入"
      };
      const exits = {
        type: "scatter",
        mode: "markers+text",
        x: chart.exitMarkers.map(m => m.date),
        y: chart.exitMarkers.map(m => m.price),
        text: chart.exitMarkers.map(m => m.label),
        textposition: "bottom center",
        marker: { color: colors.exit, size: 12, symbol: "x", line: { color: "#1e3a8a", width: 2 } },
        customdata: chart.exitMarkers.map(m => [m.reason, m.result, m.title]),
        hovertemplate: "<b>%{text}</b><br>%{customdata[2]}<br>退出: %{x}<br>价格: %{y:.2f}<br>原因: %{customdata[0]}<br>收益: %{customdata[1]}<extra></extra>",
        name: "退出"
      };
      const risks = {
        type: "scatter",
        mode: "markers+text",
        x: chart.riskMarkers.map(m => m.date),
        y: chart.riskMarkers.map(m => m.price),
        text: chart.riskMarkers.map(m => m.label),
        textposition: "top center",
        marker: { color: colors.risk, size: 12, symbol: "triangle-down", line: { color: "#7f1d1d", width: 1 } },
        customdata: chart.riskMarkers.map(m => [m.title, m.target || "-", m.url]),
        hovertemplate: "<b>%{text}</b><br>%{customdata[0]}<br>日期: %{x}<br>价格: %{y:.2f}<br>目标/风险位: %{customdata[1]}<extra></extra>",
        name: "风险/看空"
      };
      const shapes = [
        ...chart.targetSegments.map(s => ({
          type: "line", xref: "x", yref: "y", x0: s.x0, x1: s.x1, y0: s.y, y1: s.y,
          line: { color: colors.target, width: 1.5, dash: "dash" }
        })),
        ...chart.invalidationSegments.map(s => ({
          type: "line", xref: "x", yref: "y", x0: s.x0, x1: s.x1, y0: s.y, y1: s.y,
          line: { color: colors.risk, width: 1.5, dash: "dot" }
        }))
      ];
      Plotly.newPlot(el, [candle, buys, exits, risks], {
        margin: { l: 58, r: 28, t: 24, b: 44 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        showlegend: true,
        hovermode: "closest",
        xaxis: { type: "date", rangeslider: { visible: false }, gridcolor: colors.grid },
        yaxis: { gridcolor: colors.grid, fixedrange: false },
        shapes,
        font: { color: colors.text }
      }, { responsive: true, displaylogo: false });
    }
    charts.forEach(renderChart);
  </script>
</body>
</html>`;
}

async function main() {
  const replay = await readJson(EVENT_FILE);
  const events = replay.results;
  const symbols = [...new Set(events.map((event) => event.symbol))];
  const candlesBySymbol = new Map();

  for (const symbol of symbols) {
    const rows = await readJson(path.join(OUT_DIR, `${symbol}-1d.raw.json`));
    candlesBySymbol.set(symbol, normalizeRows(rows));
  }

  const trades = buildTrades(events, candlesBySymbol);
  const stats = buildStats(trades);
  const charts = symbols.map((symbol) => chartForSymbol(symbol, candlesBySymbol.get(symbol), events, trades));

  await fs.writeFile(
    path.join(OUT_DIR, "venture_strategy_trades.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), maxHoldDays: MAX_HOLD_DAYS, stats, trades }, null, 2),
    "utf8",
  );
  await fs.writeFile(DASHBOARD_FILE, buildHtml({ events, trades, stats, charts }), "utf8");
  console.log(DASHBOARD_FILE);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
