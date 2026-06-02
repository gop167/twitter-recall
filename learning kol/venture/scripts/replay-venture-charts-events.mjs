import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const KOL_DIR = path.resolve(BASE_DIR, "..");
const OUT_DIR = path.join(KOL_DIR, "output");
const END_DATE = process.env.END_DATE ?? "2026-06-02";
const DAY_MS = 24 * 60 * 60 * 1000;
const BINANCE_HOSTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://data-api.binance.vision",
];

const events = [
  {
    date: "2025-06-07",
    symbol: "BTCUSDT",
    bias: "long",
    title: "BTC positive money flow, target 118k-120k",
    target: 118000,
    url: "https://venture-charts.com/bitcoin-update-6th-june-2025/",
  },
  {
    date: "2025-06-18",
    symbol: "BTCUSDT",
    bias: "short",
    title: "BTC close below 100k would point to mid-90k",
    trigger: { type: "closeBelow", price: 100000 },
    target: 95000,
    url: "https://venture-charts.com/bitcoin-analysis-june-18th-2025/",
  },
  {
    date: "2025-07-06",
    symbol: "BTCUSDT",
    bias: "short",
    title: "BTC near ATH but demand warning below 105k",
    target: 105000,
    url: "https://venture-charts.com/btc-update-6th-july-2025/",
  },
  {
    date: "2025-08-06",
    symbol: "BTCUSDT",
    bias: "short",
    title: "BTC correction phase, 107k then 101k risk",
    target: 107000,
    url: "https://venture-charts.com/btc-update-6th-august-2025/",
  },
  {
    date: "2025-08-21",
    symbol: "BTCUSDT",
    bias: "short",
    title: "MSTR/BTC corrective phase toward 107k or 102k",
    target: 107000,
    url: "https://venture-charts.com/mstr-and-btc-analysis/",
  },
  {
    date: "2025-09-22",
    symbol: "BTCUSDT",
    bias: "short",
    title: "BTC weakening with SPX/VIX risk, short entry into 117k",
    target: 105000,
    url: "https://venture-charts.com/btc-update-22nd-september-2025/",
  },
  {
    date: "2025-11-10",
    symbol: "ETHUSDT",
    bias: "short",
    title: "ETH range-high failure risk, range low near 2500",
    target: 2500,
    url: "https://venture-charts.com/eth-htf-update-10th-november-2025/",
  },
  {
    date: "2026-01-18",
    symbol: "BTCUSDT",
    bias: "long",
    title: "BTC synced low, relief toward 104k-108k",
    target: 104000,
    url: "https://venture-charts.com/btc-update-18th-jan-2026/",
  },
  {
    date: "2026-01-31",
    symbol: "BTCUSDT",
    bias: "short",
    title: "BTC negative context, downside 75k-70k",
    target: 75000,
    url: "https://venture-charts.com/btc-update-30th-january-2026/",
  },
  {
    date: "2026-02-07",
    symbol: "BTCUSDT",
    bias: "short",
    title: "BTC extreme conditions, target 52k-43k",
    target: 52000,
    url: "https://venture-charts.com/bitcoin-analysis-7th-february-2026/",
  },
  {
    date: "2026-03-25",
    symbol: "BTCUSDT",
    bias: "long",
    title: "BTC LTF improves, consolidation can test 76k-80k",
    target: 76000,
    url: "https://venture-charts.com/btc-analysis-25th-march-2026/",
  },
  {
    date: "2026-04-07",
    symbol: "BTCUSDT",
    bias: "short",
    title: "BTC negative conditions, below 50k eventually in play",
    target: 50000,
    url: "https://venture-charts.com/bitcoin-nas100-analysis-5th-april-2026/",
  },
  {
    date: "2026-04-24",
    symbol: "BTCUSDT",
    bias: "long",
    title: "BTC LTF bullish countertrend, mid-80k possible",
    target: 83000,
    invalidation: 66000,
    url: "https://venture-charts.com/bitcoin-analysis-24th-april-2026/",
  },
  {
    date: "2026-05-03",
    symbol: "BTCUSDT",
    bias: "long",
    title: "BTC can still push to mid/low 80k, risk soon",
    target: 83000,
    url: "https://venture-charts.com/bitcoin-update-3rd-may-2024/",
  },
  {
    date: "2026-05-20",
    symbol: "BTCUSDT",
    bias: "short",
    title: "BTC likely intermediate top near 83k, 75k first objective",
    target: 75000,
    url: "https://venture-charts.com/bitcoin-analysis-may-18th-2026/",
  },
  {
    date: "2026-06-01",
    symbol: "ETHUSDT",
    bias: "short",
    title: "ETH breakdown warns rally attempts likely fail",
    target: 1900,
    url: "https://venture-charts.com/eth-analysis-1st-june-2026/",
  },
];

function dateMs(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "";
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchKlines(symbol, startDate, endDate) {
  const cachePath = path.join(OUT_DIR, `${symbol}-1d.raw.json`);
  try {
    const cached = JSON.parse(await fs.readFile(cachePath, "utf8"));
    return normalizeRows(cached);
  } catch {
    // Fall through to network fetch when no local cache exists.
  }

  let lastError;
  let rows;
  for (const host of BINANCE_HOSTS) {
    const url = new URL(`${host}/api/v3/klines`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1d");
    url.searchParams.set("startTime", String(dateMs(startDate)));
    url.searchParams.set("endTime", String(dateMs(endDate) + DAY_MS - 1));
    url.searchParams.set("limit", "1000");

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: {
          accept: "application/json",
          "user-agent": "Codex event replay (+local personal study)",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      rows = await response.json();
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!rows) throw lastError;
  await fs.writeFile(cachePath, JSON.stringify(rows, null, 2), "utf8");
  return normalizeRows(rows);
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

function findEntry(candles, event) {
  const startIndex = candles.findIndex((candle) => candle.time >= dateMs(event.date));
  if (startIndex < 0) return null;
  if (!event.trigger) return { index: startIndex, reason: "event_date_close" };

  if (event.trigger.type === "closeBelow") {
    const index = candles.findIndex((candle, i) => i >= startIndex && candle.close < event.trigger.price);
    return index >= 0 ? { index, reason: `close_below_${event.trigger.price}` } : null;
  }
  if (event.trigger.type === "closeAbove") {
    const index = candles.findIndex((candle, i) => i >= startIndex && candle.close > event.trigger.price);
    return index >= 0 ? { index, reason: `close_above_${event.trigger.price}` } : null;
  }
  return { index: startIndex, reason: "event_date_close" };
}

function candleAt(candles, entryIndex, days) {
  return candles.find((candle) => candle.time >= candles[entryIndex].time + days * DAY_MS) ?? candles.at(-1);
}

function replayEvent(candles, event) {
  const entryInfo = findEntry(candles, event);
  if (!entryInfo) return { ...event, status: "not_triggered" };

  const entry = candles[entryInfo.index];
  const window = candles.slice(entryInfo.index);
  const window7 = window.filter((candle) => candle.time <= entry.time + 7 * DAY_MS);
  const window30 = window.filter((candle) => candle.time <= entry.time + 30 * DAY_MS);
  const window60 = window.filter((candle) => candle.time <= entry.time + 60 * DAY_MS);
  const maxHigh60 = Math.max(...window60.map((candle) => candle.high));
  const minLow60 = Math.min(...window60.map((candle) => candle.low));
  const close7 = candleAt(candles, entryInfo.index, 7)?.close;
  const close30 = candleAt(candles, entryInfo.index, 30)?.close;
  const close60 = candleAt(candles, entryInfo.index, 60)?.close;

  const direction = event.bias === "short" ? -1 : 1;
  const hitTarget =
    event.target == null
      ? false
      : event.bias === "short"
        ? window60.some((candle) => candle.low <= event.target)
        : window60.some((candle) => candle.high >= event.target);
  const hitInvalidation =
    event.invalidation == null
      ? false
      : event.bias === "short"
        ? window60.some((candle) => candle.high >= event.invalidation)
        : window60.some((candle) => candle.low <= event.invalidation);

  const favorable7 = ((close7 ?? entry.close) / entry.close - 1) * direction;
  const favorable30 = ((close30 ?? entry.close) / entry.close - 1) * direction;
  const favorable60 = ((close60 ?? entry.close) / entry.close - 1) * direction;
  const mfe60 = event.bias === "short" ? entry.close / minLow60 - 1 : maxHigh60 / entry.close - 1;
  const mae60 = event.bias === "short" ? maxHigh60 / entry.close - 1 : entry.close / minLow60 - 1;

  return {
    ...event,
    status: hitInvalidation ? "invalidated" : hitTarget ? "target_hit" : "open_or_missed",
    entryReason: entryInfo.reason,
    entryDate: entry.date,
    entryPrice: entry.close,
    close7,
    close30,
    close60,
    favorable7,
    favorable30,
    favorable60,
    mfe60,
    mae60,
    minLow60,
    maxHigh60,
    hitTarget,
    hitInvalidation,
    daysObserved: Math.round((window.at(-1).time - entry.time) / DAY_MS),
  };
}

function buildMarkdown(results) {
  const scored = results.filter((result) => result.status !== "not_triggered");
  const targetHits = scored.filter((result) => result.hitTarget).length;
  const avgFav30 = scored.reduce((sum, result) => sum + (Number(result.favorable30) || 0), 0) / scored.length;
  const avgMfe60 = scored.reduce((sum, result) => sum + (Number(result.mfe60) || 0), 0) / scored.length;
  const lines = [
    "# Venture Charts Event Replay",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Replay end date: ${END_DATE}`,
    "",
    "## Method",
    "",
    "- Source events are paraphrased from public Venture Charts posts.",
    "- Entry is the daily close on the article date unless a trigger is specified.",
    "- Daily OHLC is pulled from Binance spot klines.",
    "- This is a swing-level replay, not a tick-perfect execution backtest.",
    "",
    "## Summary",
    "",
    `- Events defined: ${results.length}`,
    `- Triggered/scored events: ${scored.length}`,
    `- 60-day target hits: ${targetHits}/${scored.length}`,
    `- Average direction-adjusted 30-day close move: ${pct(avgFav30)}`,
    `- Average direction-adjusted 60-day best excursion: ${pct(avgMfe60)}`,
    "",
    "## Event Table",
    "",
    "| Date | Symbol | Bias | Status | Entry | Target | 30d Fav | 60d MFE | 60d MAE | Event |",
    "|---|---:|---|---|---:|---:|---:|---:|---:|---|",
    ...results.map((r) =>
      [
        r.date,
        r.symbol,
        r.bias,
        r.status,
        r.entryPrice ? `${r.entryDate} ${r.entryPrice.toFixed(2)}` : "",
        r.target ?? "",
        pct(r.favorable30),
        pct(r.mfe60),
        pct(r.mae60),
        `[${r.title}](${r.url})`,
      ].join(" | "),
    ).map((line) => `| ${line} |`),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const minDate = events.map((event) => event.date).sort()[0];
  const symbols = [...new Set(events.map((event) => event.symbol))];
  const candlesBySymbol = new Map();
  for (const symbol of symbols) candlesBySymbol.set(symbol, await fetchKlines(symbol, minDate, END_DATE));

  const results = events.map((event) => replayEvent(candlesBySymbol.get(event.symbol), event));
  await fs.writeFile(path.join(OUT_DIR, "event-replay.json"), JSON.stringify({ generatedAt: new Date().toISOString(), endDate: END_DATE, results }, null, 2), "utf8");

  const header = [
    "date",
    "symbol",
    "bias",
    "status",
    "entry_date",
    "entry_price",
    "target",
    "favorable_7d",
    "favorable_30d",
    "favorable_60d",
    "mfe_60d",
    "mae_60d",
    "days_observed",
    "title",
    "url",
  ];
  const rows = results.map((r) =>
    [
      r.date,
      r.symbol,
      r.bias,
      r.status,
      r.entryDate,
      r.entryPrice,
      r.target,
      r.favorable7,
      r.favorable30,
      r.favorable60,
      r.mfe60,
      r.mae60,
      r.daysObserved,
      r.title,
      r.url,
    ]
      .map(csvEscape)
      .join(","),
  );
  await fs.writeFile(path.join(OUT_DIR, "event-replay.csv"), `${header.join(",")}\n${rows.join("\n")}\n`, "utf8");
  await fs.writeFile(path.join(OUT_DIR, "event-replay.md"), buildMarkdown(results), "utf8");

  console.log(`Saved ${results.length} replay events to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
