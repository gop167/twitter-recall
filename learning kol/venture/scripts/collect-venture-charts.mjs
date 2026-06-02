import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://venture-charts.com";
const BASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const KOL_DIR = path.resolve(BASE_DIR, "..");
const OUT_DIR = path.join(KOL_DIR, "output");
const MAX_PER_PAGE = 100;

const conceptPatterns = {
  supplyDemand: /\b(supply|demand|value|range extreme|support|resistance|SR|s\/r|pivot)\b/i,
  moneyFlow: /\b(money flow|momentum|conditions|configuration|translation|flips?|reclaim)\b/i,
  timeCycle: /\b(cycle|phase|synchronicity|due|late|mid|time|pivot)\b/i,
  correlatedMarkets: /\b(correlated|inverse|USDT\.D|DXY|euro|xau|nasdaq|nas100|spx|vix|yields?)\b/i,
  technicalTools: /\b(Fibonacci|extension|expansion|pitchfork|Elliott|wave|1:1)\b/i,
  riskControl: /\b(warning|caution|fail|breakdown|loss of|close below|invalid|risk|zero interest)\b/i,
  tradePlanning: /\b(trade planning|set up|long trade|short sell|objective|target|entry|position)\b/i,
};

const symbolPatterns = {
  BTC: /\b(BTC|Bitcoin)\b/i,
  ETH: /\b(ETH|Ethereum)\b/i,
  DOGE: /\bDOGE\b/i,
  SOL: /\b(SOL|Solana)\b/i,
  TAO: /\bTAO\b/i,
  LTC: /\bLTC\b/i,
  USDT_D: /\b(USDT\.D|USDT-D|USDT dominance)\b/i,
  NAS100: /\b(NAS100|NASDAQ|NAS)\b/i,
  SPX: /\bSPX\b/i,
  XOP: /\bXOP\b/i,
  SILVER: /\b(Silver|SIL)\b/i,
  GOLD: /\b(Gold|XAU)\b/i,
  COPPER: /\b(Copper|\$HG)\b/i,
  NVDA: /\b(NVIDIA|NVDA)\b/i,
};

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html) {
  return decodeEntities(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVideoUrls(html) {
  const urls = new Set();
  for (const match of String(html ?? "").matchAll(/<video[^>]+src="([^"]+)"/gi)) {
    urls.add(decodeEntities(match[1]));
  }
  for (const match of String(html ?? "").matchAll(/https?:\/\/[^\s"'<>]+\.mp4/gi)) {
    urls.add(decodeEntities(match[0]));
  }
  return [...urls];
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchJson(endpoint, params = {}) {
  const url = new URL(`${SITE}/wp-json/wp/v2/${endpoint}`);
  url.searchParams.set("per_page", String(MAX_PER_PAGE));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Codex research collector (+local personal study)",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function normalize(item, type) {
  const title = stripHtml(item.title?.rendered ?? "");
  const html = item.content?.rendered ?? "";
  const excerpt = stripHtml(item.excerpt?.rendered ?? "");
  const text = stripHtml(html);
  const searchable = `${title} ${excerpt} ${text}`;
  const concepts = Object.entries(conceptPatterns)
    .filter(([, pattern]) => pattern.test(searchable))
    .map(([name]) => name);
  const symbols = Object.entries(symbolPatterns)
    .filter(([, pattern]) => pattern.test(searchable))
    .map(([name]) => name);

  return {
    type,
    id: item.id,
    date: item.date ?? "",
    modified: item.modified ?? "",
    slug: item.slug ?? "",
    title,
    link: item.link ?? "",
    excerpt,
    text,
    wordCount: text ? text.split(/\s+/).length : 0,
    locked: /Membership Required|must be a .* member|Join Now/i.test(text),
    videos: extractVideoUrls(html),
    symbols,
    concepts,
  };
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    for (const value of selector(item)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function buildMarkdown(items) {
  const posts = items.filter((item) => item.type === "post");
  const unlockedPosts = posts.filter((item) => !item.locked);
  const symbolCounts = countBy(posts, (item) => item.symbols);
  const conceptCounts = countBy(posts, (item) => item.concepts);
  const recent = posts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);

  const lines = [
    "# Venture Charts Public Material Index",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Source: ${SITE}`,
    "",
    "## Coverage",
    "",
    `- Posts: ${posts.length}`,
    `- Public/unlocked posts by text check: ${unlockedPosts.length}`,
    `- Pages: ${items.length - posts.length}`,
    `- Video files referenced: ${items.reduce((sum, item) => sum + item.videos.length, 0)}`,
    "",
    "## Most Common Symbols",
    "",
    ...symbolCounts.slice(0, 20).map(([symbol, count]) => `- ${symbol}: ${count}`),
    "",
    "## Most Common Concepts",
    "",
    ...conceptCounts.map(([concept, count]) => `- ${concept}: ${count}`),
    "",
    "## Recent Posts",
    "",
    ...recent.map((item) => `- ${item.date.slice(0, 10)} | ${item.title} | ${item.link}`),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const [postsRaw, pagesRaw] = await Promise.all([
    fetchJson("posts", {
      _fields: "id,date,modified,slug,link,title,excerpt,content,categories,tags",
    }),
    fetchJson("pages", {
      _fields: "id,date,modified,slug,link,title,content",
    }),
  ]);

  const items = [
    ...postsRaw.map((item) => normalize(item, "post")),
    ...pagesRaw.map((item) => normalize(item, "page")),
  ];

  await fs.writeFile(
    path.join(OUT_DIR, "materials.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), site: SITE, items }, null, 2),
    "utf8",
  );

  const header = [
    "type",
    "date",
    "title",
    "link",
    "word_count",
    "locked",
    "video_count",
    "symbols",
    "concepts",
    "excerpt",
  ];
  const rows = items.map((item) =>
    [
      item.type,
      item.date,
      item.title,
      item.link,
      item.wordCount,
      item.locked,
      item.videos.length,
      item.symbols.join("|"),
      item.concepts.join("|"),
      item.excerpt || item.text.slice(0, 240),
    ]
      .map(csvEscape)
      .join(","),
  );
  await fs.writeFile(path.join(OUT_DIR, "materials.csv"), `${header.join(",")}\n${rows.join("\n")}\n`, "utf8");
  await fs.writeFile(path.join(OUT_DIR, "material-index.md"), buildMarkdown(items), "utf8");

  console.log(`Saved ${items.length} items to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
