#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const KOL_DIR = path.resolve(SCRIPT_DIR, "..");
const WORKSPACE_DIR = path.resolve(KOL_DIR, "..");
const REPO_DIR = path.resolve(WORKSPACE_DIR, "..");
const OUT_DIR = path.join(KOL_DIR, "output");
const CACHE_DIR = path.join(OUT_DIR, "cache");
const LEVELS_FILE = path.join(KOL_DIR, "raw", "shufen_level_events.json");
const FUTU_KLINE_SCRIPT = path.resolve(process.env.FUTU_KLINE_SCRIPT ?? path.join(REPO_DIR, "scripts", "futu-kline.py"));
const FUTU_PYTHON = process.env.FUTU_PYTHON ?? "py";
const FUTU_HOST = process.env.FUTU_HOST ?? "127.0.0.1";
const FUTU_PORT = process.env.FUTU_PORT ?? "11111";
const END_DATE = process.env.END_DATE ?? "2026-06-02";
const KTYPE = process.env.KTYPE ?? "K_DAY";
const AUTYPE = process.env.AUTYPE ?? "NONE";
const DAY_MS = 24 * 60 * 60 * 1000;

function dateMs(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "";
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatPrice(value, decimals = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(decimals) : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compact(text, max = 120) {
  const oneLine = String(text ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}...` : oneLine;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function normalizeCandle(candle) {
  const time = Number(candle.time);
  return {
    time,
    date: isoDate(time),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume ?? 0),
  };
}

function dedupeCandles(candles, startMs, endMs) {
  const byTime = new Map();
  for (const candle of candles.map(normalizeCandle)) {
    if (!Number.isFinite(candle.time)) continue;
    if (candle.time < startMs || candle.time > endMs + DAY_MS) continue;
    if (![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) continue;
    byTime.set(candle.time, candle);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function fetchFutuCandles(security, startMs, endMs) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheName = `${security.code.replace(/[^A-Za-z0-9_-]/g, "_")}-${KTYPE}-${AUTYPE}-${isoDate(startMs)}-${isoDate(endMs)}.json`;
  const cachePath = path.join(CACHE_DIR, cacheName);
  try {
    const cached = await readJson(cachePath);
    return dedupeCandles(cached.candles ?? [], startMs, endMs);
  } catch {
    // Cache miss: fall through to OpenD.
  }

  const { stdout } = await execFileAsync(
    FUTU_PYTHON,
    [
      FUTU_KLINE_SCRIPT,
      "--code",
      security.code,
      "--market",
      security.market ?? "US",
      "--ktype",
      KTYPE,
      "--autype",
      AUTYPE,
      "--host",
      FUTU_HOST,
      "--port",
      FUTU_PORT,
      "--start-ms",
      String(startMs),
      "--end-ms",
      String(endMs),
    ],
    { encoding: "utf8", maxBuffer: 24 * 1024 * 1024, windowsHide: true },
  );
  const json = JSON.parse(stdout);
  await fs.writeFile(cachePath, JSON.stringify(json, null, 2), "utf8");
  return dedupeCandles(json.candles ?? [], startMs, endMs);
}

function findCandleAtOrAfter(candles, targetMs) {
  const index = candles.findIndex((candle) => candle.time >= targetMs);
  return index >= 0 ? { index, candle: candles[index] } : null;
}

function candleAfterDays(candles, entryTime, days) {
  return candles.find((candle) => candle.time >= entryTime + days * DAY_MS) ?? candles.at(-1);
}

function levelDirection(level, entryClose) {
  if (level.kind === "support") return "down";
  if (level.kind === "entry") return "any";
  if (level.kind === "reference") return "any";
  return Number(level.price) >= entryClose ? "up" : "already";
}

function firstTouch(candles, level, entryClose) {
  const price = Number(level.price);
  if (!Number.isFinite(price)) return { status: "no_level" };
  const direction = levelDirection(level, entryClose);
  if (direction === "already") {
    return {
      status: "already_past_at_entry",
      direction,
      date: candles[0]?.date,
      close: candles[0]?.close,
    };
  }
  const hit = candles.find((candle) => {
    if (direction === "up") return candle.high >= price;
    if (direction === "down") return candle.low <= price;
    return candle.low <= price && candle.high >= price;
  });
  return hit
    ? { status: "touched", direction, date: hit.date, close: hit.close }
    : { status: "not_touched", direction };
}

function analyzeEvent(event, security, candles) {
  let entry = findCandleAtOrAfter(candles, dateMs(event.date));
  const latestAvailableMarker = !entry && candles.length > 0 && dateMs(event.date) > candles.at(-1).time;
  if (latestAvailableMarker) {
    entry = { index: candles.length - 1, candle: candles.at(-1) };
  }
  if (!entry) {
    return {
      ...event,
      security,
      candles: candles.length,
      status: "no_entry_candle",
      levelResults: [],
    };
  }

  const entryCandle = entry.candle;
  const future = candles.slice(entry.index);
  const close5 = latestAvailableMarker ? null : candleAfterDays(candles, entryCandle.time, 5)?.close;
  const close20 = latestAvailableMarker ? null : candleAfterDays(candles, entryCandle.time, 20)?.close;
  const close60 = latestAvailableMarker ? null : candleAfterDays(candles, entryCandle.time, 60)?.close;
  const window60 = future.filter((candle) => candle.time <= entryCandle.time + 60 * DAY_MS);
  const maxHigh60 = Math.max(...window60.map((candle) => candle.high));
  const minLow60 = Math.min(...window60.map((candle) => candle.low));
  const direction = event.bias === "short" ? -1 : event.bias === "neutral" ? 0 : 1;
  const return5 = close5 == null ? null : close5 / entryCandle.close - 1;
  const return20 = close20 == null ? null : close20 / entryCandle.close - 1;
  const return60 = close60 == null ? null : close60 / entryCandle.close - 1;
  const mfe60 =
    direction === 0 ? maxHigh60 / entryCandle.close - 1 : direction > 0 ? maxHigh60 / entryCandle.close - 1 : entryCandle.close / minLow60 - 1;
  const mae60 =
    direction === 0 ? entryCandle.close / minLow60 - 1 : direction > 0 ? entryCandle.close / minLow60 - 1 : maxHigh60 / entryCandle.close - 1;
  const levelResults = (event.levels ?? []).map((level) => ({
    ...level,
    ...firstTouch(future, level, entryCandle.close),
  }));

  const scoredLevels = levelResults.filter((level) => ["target", "breakout", "support", "entry"].includes(level.kind));
  const touchedLevels = scoredLevels.filter((level) => ["touched", "already_past_at_entry"].includes(level.status));
  const status =
    latestAvailableMarker && scoredLevels.length === 0
      ? "mention_only_latest"
      : latestAvailableMarker
        ? "pending_next_candle"
        : scoredLevels.length === 0
          ? "mention_only"
          : touchedLevels.length === scoredLevels.length
            ? "all_levels_hit"
            : touchedLevels.length > 0
              ? "partial"
              : "not_hit";

  return {
    ...event,
    security,
    candles: candles.length,
    status,
    latestAvailableMarker,
    entryDate: entryCandle.date,
    entryPrice: entryCandle.close,
    close5,
    close20,
    close60,
    return5,
    return20,
    return60,
    maxHigh60,
    minLow60,
    mfe60,
    mae60,
    levelResults,
  };
}

function buildRows(results) {
  const rows = [];
  for (const result of results) {
    const levels = result.levelResults.length ? result.levelResults : [{ price: "", kind: "", label: "", status: "mention_only" }];
    for (const level of levels) {
      rows.push({
        id: result.id,
        date: result.date,
        symbol: result.symbol,
        name: result.security?.name,
        code: result.security?.code,
        confidence: result.confidence,
        bias: result.bias,
        status: result.status,
        entryDate: result.entryDate,
        entryPrice: result.entryPrice,
        level: level.price,
        levelKind: level.kind,
        levelLabel: level.label,
        levelStatus: level.status,
        touchDate: level.date,
        return5: result.return5,
        return20: result.return20,
        return60: result.return60,
        mfe60: result.mfe60,
        mae60: result.mae60,
        title: result.title,
        source: result.source,
      });
    }
  }
  return rows;
}

function buildCsv(rows) {
  const columns = [
    ["id", "id"],
    ["date", "date"],
    ["symbol", "symbol"],
    ["name", "name"],
    ["code", "code"],
    ["confidence", "confidence"],
    ["bias", "bias"],
    ["status", "event_status"],
    ["entryDate", "entry_date"],
    ["entryPrice", "entry_price"],
    ["level", "level"],
    ["levelKind", "level_kind"],
    ["levelLabel", "level_label"],
    ["levelStatus", "level_status"],
    ["touchDate", "touch_date"],
    ["return5", "return_5d"],
    ["return20", "return_20d"],
    ["return60", "return_60d"],
    ["mfe60", "mfe_60d"],
    ["mae60", "mae_60d"],
    ["title", "title"],
    ["source", "source"],
  ];
  return [
    columns.map(([, header]) => header).join(","),
    ...rows.map((row) => columns.map(([key]) => csvEscape(row[key])).join(",")),
  ].join("\n") + "\n";
}

function buildMarkdown(results, rows) {
  const scored = results.filter((result) => result.levelResults.length);
  const mentionOnly = results.filter((result) => !result.levelResults.length);
  const hit = rows.filter((row) => ["touched", "already_past_at_entry"].includes(row.levelStatus)).length;
  const levelRows = rows.filter((row) => row.level !== "");
  const avg20 =
    scored.reduce((sum, result) => sum + (Number(result.return20) || 0), 0) / Math.max(scored.length, 1);

  const lines = [
    "# shufen K线价位回测",
    "",
    `生成时间：${new Date().toISOString()}`,
    `回测截止：${END_DATE}`,
    "",
    "## 方法",
    "",
    "- K线来源：Futu OpenD，日K，默认不复权 `AuType.NONE`。",
    "- 有明确数值的价位才参与 level hit 统计；只提到标的但未给价位的内容只画事件点。",
    "- 入场价使用事件日期之后第一根日K收盘价；收益为日K级别的近似复盘，不代表真实成交。",
    "",
    "## 汇总",
    "",
    `- 事件数：${results.length}`,
    `- 有明确价位事件：${scored.length}`,
    `- 仅标的提及事件：${mentionOnly.length}`,
    `- 价位触达：${hit}/${levelRows.length}`,
    `- 明确价位事件平均20日收益：${pct(avg20)}`,
    "",
    "## 明确价位表",
    "",
    "| Date | Symbol | Level | Status | Touch | Entry | 20d | 60d MFE | Event |",
    "|---|---:|---:|---|---|---:|---:|---:|---|",
    ...levelRows.map((row) =>
      `| ${row.date} | ${row.symbol} | ${row.level} ${row.levelLabel ? `(${row.levelLabel})` : ""} | ${row.levelStatus} | ${row.touchDate ?? ""} | ${formatPrice(Number(row.entryPrice), 2)} | ${pct(Number(row.return20))} | ${pct(Number(row.mfe60))} | [${compact(row.title, 50)}](${row.source}) |`,
    ),
    "",
    "## 仅提及标的",
    "",
    "| Date | Symbol | Entry | 20d | Event |",
    "|---|---:|---:|---:|---|",
    ...mentionOnly.map((result) =>
      `| ${result.date} | ${result.symbol} | ${formatPrice(result.entryPrice, 2)} | ${pct(result.return20)} | ${compact(result.title, 70)} |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function buildChartData(results, candlesBySymbol, securities) {
  const symbols = [...new Set(results.map((result) => result.symbol))];
  return symbols.map((symbol) => {
    const security = securities[symbol];
    const candles = candlesBySymbol.get(symbol) ?? [];
    return {
      symbol,
      name: security.name,
      code: security.code,
      decimals: security.decimals ?? 2,
      candles: candles.map((candle) => ({
        t: candle.date,
        o: candle.open,
        h: candle.high,
        l: candle.low,
        c: candle.close,
        v: candle.volume,
      })),
      events: results
        .filter((result) => result.symbol === symbol)
        .map((result) => ({
          id: result.id,
          date: result.entryDate ?? result.date,
          sourceDate: result.date,
          title: result.title,
          source: result.source,
          confidence: result.confidence,
          bias: result.bias,
          status: result.status,
          entryPrice: result.entryPrice,
          return20: result.return20,
          mfe60: result.mfe60,
          levels: result.levelResults.map((level) => ({
            price: level.price,
            kind: level.kind,
            label: level.label,
            status: level.status,
            touchDate: level.date,
          })),
        })),
    };
  });
}

function buildHtml(chartData, rows) {
  const plotlySrc = "../../../output/plotly-2.35.2.min.js";
  const rowsHtml = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.symbol)}</td>
        <td>${escapeHtml(row.level || "-")}</td>
        <td>${escapeHtml(row.levelLabel || row.title)}</td>
        <td><span class="pill ${escapeHtml(row.levelStatus)}">${escapeHtml(row.levelStatus)}</span></td>
        <td>${escapeHtml(row.touchDate || "")}</td>
        <td>${escapeHtml(formatPrice(Number(row.entryPrice), 2))}</td>
        <td>${escapeHtml(pct(Number(row.return20)))}</td>
        <td><a href="${escapeHtml(row.source)}" target="_blank" rel="noreferrer">source</a></td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>shufen K线价位回测</title>
  <script src="${plotlySrc}"></script>
  <style>
    :root {
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #172033;
      --muted: #667085;
      --line: #d9dee7;
      --up: #0f9f6e;
      --down: #d94b4b;
      --accent: #2563eb;
      --target: #f59e0b;
      --support: #7c3aed;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
    }
    header {
      padding: 22px 28px 12px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .meta {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    main {
      max-width: 1500px;
      margin: 0 auto;
      padding: 18px 18px 36px;
    }
    section {
      margin-bottom: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    h2 {
      margin: 0;
      padding: 14px 16px;
      font-size: 16px;
      border-bottom: 1px solid var(--line);
    }
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      white-space: nowrap;
    }
    th, td {
      padding: 9px 10px;
      border-bottom: 1px solid #edf0f5;
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-weight: 600;
      background: #fbfcfe;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      background: #eef2ff;
      color: #1d4ed8;
      font-size: 12px;
    }
    .touched, .already_past_at_entry { background: #ecfdf3; color: #067647; }
    .not_touched { background: #fff7ed; color: #c2410c; }
    .mention_only { background: #f2f4f7; color: #475467; }
    .chart-card {
      padding: 0 0 10px;
    }
    .chart-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px 0;
    }
    .chart-title {
      font-size: 15px;
      font-weight: 700;
    }
    .chart-sub {
      color: var(--muted);
      font-size: 12px;
    }
    .chart {
      width: 100%;
      height: 460px;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header>
    <h1>shufen K线价位回测</h1>
    <p class="meta">K线来源：Futu OpenD 日K，不复权；入场价为事件日期之后第一根日K收盘。仅明确数值价位参与命中统计，mention-only 只画事件点。</p>
  </header>
  <main>
    <section>
      <h2>事件表</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Symbol</th><th>Level</th><th>Label / Event</th><th>Status</th><th>Touch</th><th>Entry</th><th>20d</th><th>Source</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
    ${chartData
      .map(
        (item, index) => `<section class="chart-card">
      <div class="chart-head">
        <div>
          <div class="chart-title">${escapeHtml(item.symbol)} · ${escapeHtml(item.name)}</div>
          <div class="chart-sub">${escapeHtml(item.code)} · events ${item.events.length} · candles ${item.candles.length}</div>
        </div>
      </div>
      <div class="chart" id="chart-${index}"></div>
    </section>`,
      )
      .join("")}
  </main>
  <script>
    const chartData = ${JSON.stringify(chartData)};
    const upColor = getComputedStyle(document.documentElement).getPropertyValue("--up").trim();
    const downColor = getComputedStyle(document.documentElement).getPropertyValue("--down").trim();
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const targetColor = getComputedStyle(document.documentElement).getPropertyValue("--target").trim();
    const supportColor = getComputedStyle(document.documentElement).getPropertyValue("--support").trim();

    function levelColor(kind) {
      if (kind === "support") return supportColor;
      if (kind === "entry") return "#0f766e";
      if (kind === "breakout") return accent;
      if (kind === "reference") return "#64748b";
      return targetColor;
    }

    function renderChart(item, index) {
      const el = document.getElementById("chart-" + index);
      if (!item.candles.length) {
        el.innerHTML = "<div style='padding:20px;color:#667085'>没有拿到K线。</div>";
        return;
      }
      const x = item.candles.map(c => c.t);
      const trace = {
        type: "candlestick",
        x,
        open: item.candles.map(c => c.o),
        high: item.candles.map(c => c.h),
        low: item.candles.map(c => c.l),
        close: item.candles.map(c => c.c),
        increasing: { line: { color: upColor }, fillcolor: upColor },
        decreasing: { line: { color: downColor }, fillcolor: downColor },
        name: item.symbol
      };
      const events = item.events.filter(e => Number.isFinite(Number(e.entryPrice)));
      const markers = {
        type: "scatter",
        mode: "markers",
        x: events.map(e => e.date),
        y: events.map(e => Number(e.entryPrice)),
        marker: {
          size: events.map(e => e.levels.length ? 12 : 9),
          symbol: events.map(e => e.levels.length ? "diamond" : "circle"),
          color: events.map(e => e.levels.length ? "#f97316" : "#64748b"),
          line: { color: "#ffffff", width: 1 }
        },
        customdata: events.map(e => [
          e.title,
          e.sourceDate,
          e.status,
          e.confidence,
          e.return20 == null ? "" : (e.return20 * 100).toFixed(2) + "%",
          e.mfe60 == null ? "" : (e.mfe60 * 100).toFixed(2) + "%"
        ]),
        hovertemplate:
          "<b>%{customdata[0]}</b><br>" +
          "事件日：%{customdata[1]}<br>" +
          "状态：%{customdata[2]} / %{customdata[3]}<br>" +
          "20d：%{customdata[4]} / 60d MFE：%{customdata[5]}<extra></extra>",
        name: "事件落点"
      };
      const lastX = x[x.length - 1];
      const shapes = [];
      const annotations = [];
      for (const event of events) {
        shapes.push({
          type: "line",
          x0: event.date,
          x1: event.date,
          y0: 0,
          y1: 1,
          xref: "x",
          yref: "paper",
          line: { color: event.levels.length ? "#f97316" : "#98a2b3", width: 1, dash: "dot" }
        });
        event.levels.forEach((level, levelIndex) => {
          const y = Number(level.price);
          if (!Number.isFinite(y)) return;
          const color = levelColor(level.kind);
          shapes.push({
            type: "line",
            x0: event.date,
            x1: lastX,
            y0: y,
            y1: y,
            xref: "x",
            yref: "y",
            line: { color, width: 1.2, dash: level.status === "not_touched" ? "dash" : "solid" }
          });
          annotations.push({
            x: lastX,
            y,
            xref: "x",
            yref: "y",
            text: level.label + " " + level.price,
            showarrow: false,
            xanchor: "right",
            yanchor: levelIndex % 2 ? "top" : "bottom",
            bgcolor: "#ffffff",
            bordercolor: color,
            borderwidth: 1,
            borderpad: 3,
            font: { color, size: 11 }
          });
        });
      }
      Plotly.newPlot(el, [trace, markers], {
        margin: { l: 58, r: 28, t: 18, b: 44 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        showlegend: true,
        hovermode: "closest",
        xaxis: { rangeslider: { visible: false }, gridcolor: "#eef1f5", type: "date" },
        yaxis: { fixedrange: false, gridcolor: "#eef1f5" },
        shapes,
        annotations
      }, { responsive: true, displaylogo: false });
    }

    chartData.forEach(renderChart);
  </script>
</body>
</html>`;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const input = await readJson(LEVELS_FILE);
  const events = input.events;
  const securities = input.securities;
  const symbols = [...new Set(events.map((event) => event.symbol))];
  const endMs = dateMs(END_DATE) + DAY_MS - 1;
  const candlesBySymbol = new Map();
  const errors = [];

  for (const symbol of symbols) {
    const security = securities[symbol];
    const symbolEvents = events.filter((event) => event.symbol === symbol);
    const minEventMs = Math.min(...symbolEvents.map((event) => dateMs(event.date)));
    const startMs = minEventMs - 45 * DAY_MS;
    try {
      console.log(`[futu] ${symbol} ${security.code} ${isoDate(startMs)} -> ${END_DATE}`);
      candlesBySymbol.set(symbol, await fetchFutuCandles(security, startMs, endMs));
    } catch (error) {
      const message = [error.stderr, error.stdout, error.message].filter(Boolean).join(" ").trim();
      errors.push({ symbol, code: security.code, message });
      candlesBySymbol.set(symbol, []);
      console.warn(`[warn] ${symbol} failed: ${message}`);
    }
  }

  const results = events.map((event) => analyzeEvent(event, securities[event.symbol], candlesBySymbol.get(event.symbol) ?? []));
  const rows = buildRows(results);
  const chartData = buildChartData(results, candlesBySymbol, securities);

  await fs.writeFile(
    path.join(OUT_DIR, "shufen_kline_replay.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), endDate: END_DATE, ktype: KTYPE, autype: AUTYPE, results, errors }, null, 2),
    "utf8",
  );
  await fs.writeFile(path.join(OUT_DIR, "shufen_kline_replay.csv"), buildCsv(rows), "utf8");
  await fs.writeFile(path.join(OUT_DIR, "shufen_kline_replay.md"), buildMarkdown(results, rows), "utf8");
  await fs.writeFile(path.join(OUT_DIR, "shufen_kline_replay.html"), buildHtml(chartData, rows), "utf8");

  console.log(`[done] events=${events.length} rows=${rows.length} errors=${errors.length}`);
  console.log(`[done] ${path.join(OUT_DIR, "shufen_kline_replay.html")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
