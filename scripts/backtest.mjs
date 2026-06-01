import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ACCOUNT = process.env.X_ACCOUNT ?? "nihaovand";
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? "output");
const MEDIA_DIR = path.join(OUT_DIR, "media");
const OCR_CACHE_FILE = path.join(OUT_DIR, "media_ocr.json");
const OCR_SCRIPT = path.resolve("scripts/ocr-image.ps1");
const PLOTLY_CDN = "https://cdn.plot.ly/plotly-2.35.2.min.js";
const PLOTLY_LOCAL = "plotly-2.35.2.min.js";
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = Date.now();
const execFileAsync = promisify(execFile);

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagPatterns(symbol, extra = []) {
  const escaped = escapeRegExp(symbol);
  return [new RegExp(`[\\$#＄＃]\\s*${escaped}\\b`, "i"), ...extra];
}

function wordPatterns(symbol, extra = []) {
  const escaped = escapeRegExp(symbol);
  return [...tagPatterns(symbol), new RegExp(`\\b${escaped}\\b`, "i"), ...extra];
}

function spotToken(symbol, name, spotSymbol = `${symbol}USDT`, patterns = tagPatterns(symbol)) {
  return { symbol, name, patterns, source: { type: "binance", symbol: spotSymbol } };
}

function alphaToken(symbol, name, alphaSymbol, patterns = tagPatterns(symbol)) {
  return { symbol, name, patterns, source: { type: "alpha", symbol: alphaSymbol } };
}

function multiSourceToken(symbol, name, sources, patterns = tagPatterns(symbol)) {
  return { symbol, name, patterns, source: { type: "multi", sources } };
}

function unresolvedToken(symbol, name, patterns = tagPatterns(symbol)) {
  return { symbol, name, patterns, source: { type: "unresolved", symbol } };
}

const BASE_TOKEN_CONFIGS = [
  { symbol: "SUI", name: "Sui", patterns: [/\bSUI\b/i], source: { type: "binance", symbol: "SUIUSDT" } },
  { symbol: "BNB", name: "BNB", patterns: [/\bBNB\b/i, /\bBNB Chain\b/i], source: { type: "binance", symbol: "BNBUSDT" } },
  { symbol: "SOLV", name: "Solv Protocol", patterns: [/\bSOLV\b/i], source: { type: "binance", symbol: "SOLVUSDT" } },
  { symbol: "GPS", name: "GoPlus Security", patterns: [/\bGPS\b/i, /\bGoPlus\b/i], source: { type: "binance", symbol: "GPSUSDT" } },
  { symbol: "SIGN", name: "Sign", patterns: [/\$SIGN\b/i, /\bSign\b/i, /@sign\b/i], source: { type: "binance", symbol: "SIGNUSDT" } },
  { symbol: "SAHARA", name: "Sahara AI", patterns: [/\bSahara\b/i, /\bSAHARA\b/i], source: { type: "binance", symbol: "SAHARAUSDT" } },
  { symbol: "ASTER", name: "Aster", patterns: [/\$ASTER\b/i, /\bAster\b/i], source: { type: "binance", symbol: "ASTERUSDT" } },
  { symbol: "PLUME", name: "Plume", patterns: [/\bPlume\b/i, /\bPLUME\b/i], source: { type: "binance", symbol: "PLUMEUSDT" } },
  { symbol: "TRUMP", name: "OFFICIAL TRUMP", patterns: [/\bTRUMP\b/i, /\bTrump\b/], source: { type: "binance", symbol: "TRUMPUSDT" } },
  { symbol: "CETUS", name: "Cetus", patterns: [/\bCETUS\b/i], source: { type: "binance", symbol: "CETUSUSDT" } },
  { symbol: "OKB", name: "OKB", patterns: [/\bOKB\b/i], source: { type: "gate", pair: "OKB_USDT" } },
  { symbol: "M", name: "Memecore", patterns: [/\$M\b/, /\bMemecore\b/, /\bM\s+直接破/i], source: { type: "gate", pair: "M_USDT" } },
  { symbol: "DRIFT", name: "Drift", patterns: [/\bDrift\b/i, /\bDRIFT\b/i], source: { type: "gate", pair: "DRIFT_USDT" } },
  { symbol: "MEW", name: "Mew", patterns: [/\bMEW\b/i, /\bMew\b/], source: { type: "gate", pair: "MEW_USDT" } },
  { symbol: "KIP", name: "KIP Protocol", patterns: [/\bKIP\b/], source: { type: "gate", pair: "KIP_USDT" } },
  {
    symbol: "KET",
    name: "yellow ket",
    patterns: [/\$KET\b/i, /\bKET\b/, /0xFFFF003a6BAD9b743d658048742935fFFE2b6ED7/i],
    source: { type: "gecko", network: "avax", pool: "0x9962cf3ba621beb96d3fa2614d24161a717ada71" },
  },
  {
    symbol: "WIZZ",
    name: "Wizzwoods",
    patterns: [/\bWizz\b/i, /\bWizzwoods\b/i, /\bWIZZ\b/],
    source: { type: "gecko", network: "berachain", pool: "0x1b7b061091bd2c900723107889fe44f825d6c921" },
  },
  {
    symbol: "ARIAIP",
    name: "Aria",
    patterns: [/\bARIAIP\b/i, /\bAriaip\b/i, /\bAiraip\b/i],
    source: { type: "gecko", network: "bsc", pool: "0x15c90b9009decf76942945692b5b48dc834ac3345efdadeebea0336418f7b607" },
  },
  { symbol: "DOGE", name: "Dogecoin", patterns: [/\bdogecoin\b/i, /\bDOGE\b/], source: { type: "binance", symbol: "DOGEUSDT" } },
  { symbol: "LTC", name: "Litecoin", patterns: [/\blitecoin\b/i, /\bLTC\b/], source: { type: "binance", symbol: "LTCUSDT" } },
];

const ACCOUNT_TOKEN_CONFIGS = {
  btckik: [
    spotToken("SEI", "Sei", "SEIUSDT", tagPatterns("SEI")),
    spotToken("TIA", "Celestia", "TIAUSDT", tagPatterns("TIA")),
    spotToken("ALT", "AltLayer", "ALTUSDT", tagPatterns("ALT")),
    spotToken("SAGA", "Saga", "SAGAUSDT", tagPatterns("SAGA")),
    spotToken("ACT", "Act I: The AI Prophecy", "ACTUSDT", tagPatterns("ACT")),
    unresolvedToken("PUNT", "Punt", tagPatterns("PUNT")),
    spotToken("PNUT", "Peanut the Squirrel", "PNUTUSDT", tagPatterns("PNUT")),
    spotToken("WIF", "dogwifhat", "WIFUSDT", tagPatterns("WIF")),
    alphaToken("METAV", "METAVERSE", "ALPHA_59USDT", tagPatterns("METAV")),
    alphaToken("ARC", "AI Rig Complex", "ALPHA_50USDT", wordPatterns("ARC", [/\bArc Forge\b/i])),
    alphaToken("AI16Z", "ai16z", "ALPHA_4USDT", [/\$?\bAI16Z\b/i, /\bA16Z\b/i, /\bA16A\b/i]),
    alphaToken("FARTCOIN", "Fartcoin", "ALPHA_10USDT", tagPatterns("FARTCOIN")),
    alphaToken("POPCAT", "Popcat", "ALPHA_150USDT", tagPatterns("POPCAT")),
    alphaToken("SWARMS", "swarms", "ALPHA_58USDT", tagPatterns("SWARMS", [/\$SWARMA\b/i])),
    multiSourceToken(
      "TST",
      "Test Token",
      [
        { type: "alpha", symbol: "ALPHA_87USDT" },
        { type: "binance", symbol: "TSTUSDT" },
      ],
      tagPatterns("TST"),
    ),
    alphaToken("KOMA", "Koma Inu", "ALPHA_1USDT", tagPatterns("KOMA")),
    spotToken("CAT", "Simon's Cat", "1000CATUSDT", tagPatterns("CAT")),
    spotToken("FLOKI", "FLOKI", "FLOKIUSDT", tagPatterns("FLOKI")),
    unresolvedToken("SSE", "SSE", tagPatterns("SSE")),
    unresolvedToken("PEP", "PEP", tagPatterns("PEP")),
    unresolvedToken("DUO", "DUO", tagPatterns("DUO")),
    alphaToken("BUBB", "Bubb", "ALPHA_125USDT", tagPatterns("BUBB")),
    multiSourceToken(
      "MUBARAK",
      "mubarak",
      [
        { type: "alpha", symbol: "ALPHA_116USDT" },
        { type: "binance", symbol: "MUBARAKUSDT" },
      ],
      wordPatterns("MUBARAK"),
    ),
    alphaToken("RFC", "Retard Finder Coin", "ALPHA_139USDT", tagPatterns("RFC")),
    alphaToken("DARK", "Dark Eclipse", "ALPHA_143USDT", tagPatterns("DARK")),
    alphaToken("GOAT", "Goatseus Maximus", "ALPHA_179USDT", tagPatterns("GOAT")),
    spotToken("SHIB", "Shiba Inu", "SHIBUSDT", tagPatterns("SHIB")),
    alphaToken("MOODENG", "Moo Deng", "ALPHA_178USDT", wordPatterns("MOODENG")),
    spotToken("NEIRO", "Neiro", "NEIROUSDT", tagPatterns("NEIRO")),
    spotToken("ENA", "Ethena", "ENAUSDT", tagPatterns("ENA", [/\bENAUSDT\b/i])),
    spotToken("NOT", "Notcoin", "NOTUSDT", tagPatterns("NOT", [/\bNOTUSDT\b/i])),
    spotToken("BOME", "BOOK OF MEME", "BOMEUSDT", tagPatterns("BOME")),
    multiSourceToken(
      "ASTER",
      "Aster",
      [
        { type: "alpha", symbol: "ALPHA_380USDT" },
        { type: "binance", symbol: "ASTERUSDT" },
      ],
      wordPatterns("ASTER"),
    ),
    multiSourceToken(
      "XPL",
      "Plasma",
      [
        { type: "alpha", symbol: "ALPHA_392USDT" },
        { type: "binance", symbol: "XPLUSDT" },
      ],
      tagPatterns("XPL"),
    ),
    multiSourceToken(
      "FF",
      "Falcon Finance",
      [
        { type: "alpha", symbol: "ALPHA_398USDT" },
        { type: "binance", symbol: "FFUSDT" },
      ],
      tagPatterns("FF"),
    ),
  ],
};

function activeTokenConfigs() {
  const configs = [...BASE_TOKEN_CONFIGS, ...(ACCOUNT_TOKEN_CONFIGS[ACCOUNT.toLowerCase()] ?? [])];
  const bySymbol = new Map();
  for (const config of configs) bySymbol.set(config.symbol, config);
  return [...bySymbol.values()];
}

const TOKEN_CONFIGS = activeTokenConfigs();

const IGNORE_TOKEN_SYMBOLS = new Set(["USDC", "USDT", "USD", "SOL", "ETH", "BTC"]);

function compactText(text, max = 220) {
  const oneLine = String(text ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}...` : oneLine;
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns) {
  return [
    columns.map((c) => csvEscape(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(",")),
  ].join("\n");
}

async function writeOutputFile(filename, content) {
  const target = path.join(OUT_DIR, filename);
  try {
    await fs.writeFile(target, content, "utf8");
    return target;
  } catch (error) {
    if (!["EBUSY", "EPERM", "EACCES"].includes(error.code)) throw error;
    const extension = path.extname(filename);
    const base = path.basename(filename, extension);
    const fallback = path.join(OUT_DIR, `${base}.${new Date().toISOString().replace(/[:.]/g, "-")}${extension}`);
    await fs.writeFile(fallback, content, "utf8");
    console.warn(`[write] ${filename} is locked; wrote ${path.basename(fallback)} instead`);
    return fallback;
  }
}

async function fetchJson(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "user-agent": "Mozilla/5.0",
          accept: "application/json,text/plain,*/*",
          ...(options.headers ?? {}),
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${text.slice(0, 240)}`);
      }
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(600 * attempt);
    }
  }
  throw lastError;
}

async function fetchText(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "user-agent": "Mozilla/5.0",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...(options.headers ?? {}),
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${text.slice(0, 240)}`);
      }
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(600 * attempt);
    }
  }
  throw lastError;
}

async function fetchBuffer(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "user-agent": "Mozilla/5.0",
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          ...(options.headers ?? {}),
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status} ${response.statusText} ${text.slice(0, 160)}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(600 * attempt);
    }
  }
  throw lastError;
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function parseArrayLiteral(literal) {
  return [...String(literal ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function extractOperation(mainJs, operationName) {
  const escapedName = operationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `queryId:"([^"]+)",operationName:"${escapedName}",operationType:"query",metadata:\\{featureSwitches:\\[(.*?)\\],fieldToggles:\\[(.*?)\\]\\}`,
    "s",
  );
  const match = mainJs.match(re);
  if (!match) throw new Error(`Cannot find X GraphQL operation ${operationName}`);
  return {
    queryId: match[1],
    features: Object.fromEntries(parseArrayLiteral(match[2]).map((key) => [key, true])),
    fieldToggles: Object.fromEntries(parseArrayLiteral(match[3]).map((key) => [key, true])),
  };
}

async function loadXWebConfig() {
  const profileHtml = await fetchText(`https://x.com/${ACCOUNT}`);
  const mainUrl =
    [...profileHtml.matchAll(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[^"]+\.js/g)].at(-1)?.[0] ??
    "https://abs.twimg.com/responsive-web/client-web/main.418f9c9a.js";
  const mainJs = await fetchText(mainUrl);
  await writeOutputFile("x_main.js", mainJs);
  const bearer = [...mainJs.matchAll(/Bearer ([A-Za-z0-9%]+)/g)][0]?.[1];
  if (!bearer) throw new Error("Cannot extract X bearer token from main JS");
  return {
    bearer,
    mainUrl,
    operations: {
      UserByScreenName: extractOperation(mainJs, "UserByScreenName"),
      UserTweets: extractOperation(mainJs, "UserTweets"),
    },
  };
}

async function activateGuest(bearer) {
  const data = await fetchJson("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      origin: "https://x.com",
      referer: "https://x.com/",
    },
  });
  return data.guest_token;
}

async function xGraphql(config, guestToken, operationName, variables) {
  const operation = config.operations[operationName];
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(operation.features),
    fieldToggles: JSON.stringify(operation.fieldToggles),
  });
  const url = `https://api.x.com/graphql/${operation.queryId}/${operationName}?${params}`;
  return fetchJson(url, {
    headers: {
      authorization: `Bearer ${config.bearer}`,
      "x-guest-token": guestToken,
      "x-twitter-active-user": "yes",
      "x-twitter-client-language": "en",
      origin: "https://x.com",
      referer: `https://x.com/${ACCOUNT}`,
    },
  });
}

function getTimeline(rawPage) {
  return (
    rawPage?.data?.user?.result?.timeline_v2?.timeline ??
    rawPage?.data?.user?.result?.timeline?.timeline ??
    rawPage?.data?.threaded_conversation_with_injections_v2
  );
}

function getTimelineEntries(rawPage) {
  const timeline = getTimeline(rawPage);
  const instructions = timeline?.instructions ?? [];
  const entries = [];
  for (const instruction of instructions) {
    if (instruction.entry) entries.push(instruction.entry);
    if (Array.isArray(instruction.entries)) entries.push(...instruction.entries);
  }
  return entries;
}

function unwrapTweetResult(result) {
  let current = result;
  for (let i = 0; i < 5 && current; i += 1) {
    if (current.tweet) current = current.tweet;
    else if (current.__typename === "TweetWithVisibilityResults" && current.tweet) current = current.tweet;
    else break;
  }
  if (!current || current.__typename === "TweetTombstone") return null;
  return current;
}

function extractTweetFromEntry(entry) {
  const item = entry?.content?.itemContent ?? entry?.content?.items?.[0]?.item?.itemContent;
  return unwrapTweetResult(item?.tweet_results?.result);
}

function extractTweetMedia(tweet) {
  const mediaItems = tweet.legacy?.extended_entities?.media ?? tweet.legacy?.entities?.media ?? [];
  const seen = new Set();
  return mediaItems
    .filter((media) => media?.media_url_https && ["photo", "video", "animated_gif"].includes(media.type))
    .map((media, index) => {
      const url = media.media_url_https;
      if (seen.has(url)) return null;
      seen.add(url);
      return {
        index: index + 1,
        type: media.type,
        url,
        expandedUrl: media.expanded_url ?? "",
        localPath: "",
        localRel: "",
        ocrText: "",
        ocrError: "",
      };
    })
    .filter(Boolean);
}

function mediaExtension(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return ext;
  return ".jpg";
}

async function ensureMediaFile(tweetId, media) {
  const filename = `${tweetId}_${String(media.index).padStart(2, "0")}${mediaExtension(media.url)}`;
  const localPath = path.join(MEDIA_DIR, filename);
  try {
    await fs.access(localPath);
  } catch {
    const buffer = await fetchBuffer(media.url);
    await fs.writeFile(localPath, buffer);
  }
  return { localPath, localRel: `media/${filename}` };
}

async function ocrImage(localPath) {
  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", OCR_SCRIPT, "-Path", localPath],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout.replace(/\s+/g, " ").trim();
}

async function enrichTweetsWithOcr(tweets) {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const cache = await readJsonIfExists(OCR_CACHE_FILE, {});
  let changed = false;
  let mediaCount = 0;
  let ocrCount = 0;

  for (const tweet of tweets) {
    if (!tweet.media?.length) continue;
    for (const media of tweet.media) {
      mediaCount += 1;
      try {
        const local = await ensureMediaFile(tweet.id, media);
        media.localPath = local.localPath;
        media.localRel = local.localRel;
        if (cache[media.url]) {
          media.ocrText = cache[media.url].text ?? "";
          media.ocrError = cache[media.url].error ?? "";
          continue;
        }
        const text = await ocrImage(local.localPath);
        media.ocrText = text;
        cache[media.url] = { text, error: "", localRel: media.localRel };
        changed = true;
        ocrCount += 1;
      } catch (error) {
        media.ocrError = error.message;
        cache[media.url] = { text: "", error: error.message, localRel: media.localRel };
        changed = true;
      }
    }
  }

  if (changed) await writeOutputFile("media_ocr.json", JSON.stringify(cache, null, 2));
  console.log(`[ocr] ${mediaCount} media image(s), ${ocrCount} newly OCR'd`);
  return tweets;
}

function extractBottomCursor(rawPage) {
  for (const entry of getTimelineEntries(rawPage)) {
    const content = entry.content;
    if (content?.cursorType === "Bottom" && content?.value) return content.value;
    if (entry.entryId?.includes("cursor-bottom") && content?.value) return content.value;
  }
  return null;
}

async function fetchTweets() {
  const config = await loadXWebConfig();
  const guestToken = await activateGuest(config.bearer);
  const userRaw = await xGraphql(config, guestToken, "UserByScreenName", { screen_name: ACCOUNT });
  const user = userRaw.data?.user?.result;
  const userId = user?.rest_id;
  if (!userId) throw new Error(`Cannot resolve user id for @${ACCOUNT}`);

  const baseVariables = {
    userId,
    count: 100,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: true,
    withVoice: true,
    withV2Timeline: true,
  };

  const pages = [];
  let cursor = null;
  for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
    const variables = cursor ? { ...baseVariables, cursor } : baseVariables;
    const page = await xGraphql(config, guestToken, "UserTweets", variables);
    pages.push(page);
    const nextCursor = extractBottomCursor(page);
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  const tweetsById = new Map();
  for (const page of pages) {
    for (const entry of getTimelineEntries(page)) {
      const tweet = extractTweetFromEntry(entry);
      if (!tweet?.rest_id || !tweet.legacy?.created_at) continue;
      const author = tweet.core?.user_results?.result;
      const authorId = author?.rest_id ?? tweet.legacy.user_id_str;
      const screenName = author?.core?.screen_name ?? author?.legacy?.screen_name;
      if (authorId && authorId !== userId) continue;
      if (screenName && screenName.toLowerCase() !== ACCOUNT.toLowerCase()) continue;
      const fullText = tweet.note_tweet?.note_tweet_results?.result?.text ?? tweet.legacy.full_text ?? "";
      tweetsById.set(tweet.rest_id, {
        id: tweet.rest_id,
        url: `https://x.com/${ACCOUNT}/status/${tweet.rest_id}`,
        createdAt: new Date(tweet.legacy.created_at).toISOString(),
        text: fullText,
        media: extractTweetMedia(tweet),
        favoriteCount: tweet.legacy.favorite_count ?? null,
        retweetCount: tweet.legacy.retweet_count ?? null,
        replyCount: tweet.legacy.reply_count ?? null,
      });
    }
  }

  const tweets = [...tweetsById.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  await enrichTweetsWithOcr(tweets);
  await writeOutputFile("raw_timeline.json", JSON.stringify({ userRaw, pages }, null, 2));
  await writeOutputFile("tweets.json", JSON.stringify(tweets, null, 2));
  return { tweets, userId, configMeta: { mainUrl: config.mainUrl, pages: pages.length } };
}

function extractCalls(tweets) {
  const calls = [];
  for (const tweet of tweets) {
    const ocrText = (tweet.media ?? []).map((media) => media.ocrText).filter(Boolean).join("\n");
    const combinedText = `${tweet.text}\n${ocrText}`.trim();
    for (const token of TOKEN_CONFIGS) {
      if (IGNORE_TOKEN_SYMBOLS.has(token.symbol)) continue;
      const matchedInText = token.patterns.some((pattern) => pattern.test(tweet.text));
      const matchedInOcr = ocrText ? token.patterns.some((pattern) => pattern.test(ocrText)) : false;
      if (!matchedInText && !matchedInOcr) continue;
      calls.push({
        callId: `${token.symbol}-${tweet.id}`,
        symbol: token.symbol,
        tokenName: token.name,
        tweetId: tweet.id,
        tweetUrl: tweet.url,
        tweetTime: tweet.createdAt,
        text: tweet.text,
        ocrText,
        evidenceText: combinedText,
        evidenceSource: matchedInText && matchedInOcr ? "文字+配图OCR" : matchedInOcr ? "配图OCR" : "文字",
        media: tweet.media ?? [],
        sourceType: token.source.type,
      });
    }
  }
  return calls.sort((a, b) => Date.parse(a.tweetTime) - Date.parse(b.tweetTime) || a.symbol.localeCompare(b.symbol));
}

function normalizeCandle(candle) {
  return {
    time: candle.time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume ?? 0),
  };
}

async function fetchBinanceCandles(symbol, startMs, endMs) {
  const candles = [];
  let cursor = Math.max(0, startMs);
  while (cursor < endMs) {
    const params = new URLSearchParams({
      symbol,
      interval: "4h",
      startTime: String(cursor),
      endTime: String(endMs),
      limit: "1000",
    });
    const rows = await fetchJson(`https://api.binance.com/api/v3/klines?${params}`);
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      candles.push(
        normalizeCandle({
          time: Number(row[0]),
          open: row[1],
          high: row[2],
          low: row[3],
          close: row[4],
          volume: row[5],
        }),
      );
    }
    const next = Number(rows.at(-1)[0]) + FOUR_HOURS_MS;
    if (next <= cursor) break;
    cursor = next;
    await sleep(120);
  }
  return dedupeCandles(candles, startMs, endMs);
}

async function fetchAlphaCandles(symbol, startMs, endMs) {
  const candles = [];
  let cursor = Math.max(0, startMs);
  while (cursor < endMs) {
    const params = new URLSearchParams({
      symbol,
      interval: "4h",
      startTime: String(cursor),
      endTime: String(endMs),
      limit: "1000",
    });
    const json = await fetchJson(`https://www.binance.com/bapi/defi/v1/public/alpha-trade/klines?${params}`);
    const rows = Array.isArray(json?.data) ? json.data : [];
    if (!rows.length) break;
    for (const row of rows) {
      candles.push(
        normalizeCandle({
          time: Number(row[0]),
          open: row[1],
          high: row[2],
          low: row[3],
          close: row[4],
          volume: row[5],
        }),
      );
    }
    const next = Number(rows.at(-1)[0]) + FOUR_HOURS_MS;
    if (next <= cursor) break;
    cursor = next;
    await sleep(180);
  }
  return dedupeCandles(candles, startMs, endMs);
}

async function fetchGateCandles(pair, startMs, endMs) {
  const candles = [];
  const maxSpan = 999 * FOUR_HOURS_MS;
  for (let chunkStart = startMs; chunkStart < endMs; chunkStart += maxSpan) {
    const chunkEnd = Math.min(endMs, chunkStart + maxSpan);
    const params = new URLSearchParams({
      currency_pair: pair,
      interval: "4h",
      from: String(Math.floor(chunkStart / 1000)),
      to: String(Math.floor(chunkEnd / 1000)),
      limit: "1000",
    });
    const rows = await fetchJson(`https://api.gateio.ws/api/v4/spot/candlesticks?${params}`);
    candles.push(
      ...rows.map((row) =>
        normalizeCandle({
          time: Number(row[0]) * 1000,
          open: row[5],
          high: row[3],
          low: row[4],
          close: row[2],
          volume: row[1],
        }),
      ),
    );
    await sleep(120);
  }
  return dedupeCandles(candles, startMs, endMs);
}

async function fetchGeckoCandles(network, pool, startMs, endMs) {
  const candles = [];
  let before = Math.floor(endMs / 1000);
  for (let i = 0; i < 8; i += 1) {
    const params = new URLSearchParams({
      aggregate: "4",
      before_timestamp: String(before),
      limit: "1000",
      currency: "usd",
      token: "base",
    });
    const json = await fetchJson(
      `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}/ohlcv/hour?${params}`,
    );
    const rows = json.data?.attributes?.ohlcv_list ?? [];
    if (!rows.length) break;
    for (const row of rows) {
      candles.push(
        normalizeCandle({
          time: Number(row[0]) * 1000,
          open: row[1],
          high: row[2],
          low: row[3],
          close: row[4],
          volume: row[5],
        }),
      );
    }
    const minTs = Math.min(...rows.map((row) => Number(row[0])));
    if (minTs * 1000 <= startMs) break;
    before = minTs - 1;
    await sleep(1200);
  }
  return dedupeCandles(candles, startMs, endMs);
}

function dedupeCandles(candles, startMs, endMs) {
  const byTime = new Map();
  for (const candle of candles) {
    if (!Number.isFinite(candle.time)) continue;
    if (candle.time < startMs || candle.time > endMs) continue;
    if (![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) continue;
    byTime.set(candle.time, candle);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function fetchCandles(source, startMs, endMs) {
  if (source.type === "multi") {
    const chunks = [];
    const errors = [];
    for (const nested of source.sources ?? []) {
      try {
        const nestedCandles = await fetchCandles(nested, startMs, endMs);
        if (nestedCandles.length) chunks.push(...nestedCandles);
      } catch (error) {
        errors.push(`${sourceLabel(nested)}: ${error.message}`);
      }
      await sleep(120);
    }
    if (!chunks.length && errors.length) throw new Error(errors.join("; "));
    return dedupeCandles(chunks, startMs, endMs);
  }
  if (source.type === "binance") return fetchBinanceCandles(source.symbol, startMs, endMs);
  if (source.type === "alpha") return fetchAlphaCandles(source.symbol, startMs, endMs);
  if (source.type === "gate") return fetchGateCandles(source.pair, startMs, endMs);
  if (source.type === "gecko") return fetchGeckoCandles(source.network, source.pool, startMs, endMs);
  throw new Error(`Unknown source ${source.type}`);
}

async function fetchListingStartMs(source, candles, requestedStartMs) {
  if (!candles.length) return null;
  if (source.type === "multi") return candles[0].time;
  if (source.type === "binance") {
    const params = new URLSearchParams({
      symbol: source.symbol,
      interval: "4h",
      startTime: "0",
      limit: "1",
    });
    const rows = await fetchJson(`https://api.binance.com/api/v3/klines?${params}`);
    const first = Number(rows?.[0]?.[0]);
    return Number.isFinite(first) ? first : null;
  }
  if (source.type === "alpha") {
    const params = new URLSearchParams({
      symbol: source.symbol,
      interval: "4h",
      startTime: "0",
      limit: "1",
    });
    const json = await fetchJson(`https://www.binance.com/bapi/defi/v1/public/alpha-trade/klines?${params}`);
    const first = Number(json?.data?.[0]?.[0]);
    return Number.isFinite(first) ? first : null;
  }

  const firstInWindow = candles[0].time;
  if (firstInWindow - requestedStartMs > 8 * 60 * 60 * 1000) return firstInWindow;
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fmtPct(value) {
  if (value == null || !Number.isFinite(value)) return "";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function findCandleAtOrAfter(candles, targetMs) {
  return candles.findIndex((candle) => candle.time >= targetMs);
}

function analyzeCall(call, candles, listingStartMs = null, options = {}) {
  const tweetMs = Date.parse(call.tweetTime);
  const entryIndex = findCandleAtOrAfter(candles, tweetMs);
  if (entryIndex < 0) {
    return {
      ...call,
      entryTime: "",
      entryPrice: "",
      delayHours: "",
      return24h: "",
      return7d: "",
      return30d: "",
      max30d: "",
      min30d: "",
      status: "no candle after tweet",
    };
  }

  const entry = candles[entryIndex];
  const entryPrice = entry.open;
  if (listingStartMs != null && entry.time < listingStartMs + DAY_MS && !options.allowFirstDay) {
    return {
      ...call,
      entryTime: new Date(entry.time).toISOString(),
      entryPrice,
      delayHours: ((entry.time - tweetMs) / (60 * 60 * 1000)).toFixed(2),
      return24h: "",
      return7d: "",
      return30d: "",
      max30d: "",
      min30d: "",
      listingStartTime: new Date(listingStartMs).toISOString(),
      status: "excluded_first_day",
    };
  }

  const horizonReturn = (ms) => {
    const idx = findCandleAtOrAfter(candles, entry.time + ms);
    if (idx < 0 || !entryPrice) return null;
    return ((candles[idx].close - entryPrice) / entryPrice) * 100;
  };
  const end30 = entry.time + 30 * DAY_MS;
  const window30 = candles.filter((candle) => candle.time >= entry.time && candle.time <= end30);
  const high30 = window30.length ? Math.max(...window30.map((candle) => candle.high)) : null;
  const low30 = window30.length ? Math.min(...window30.map((candle) => candle.low)) : null;

  return {
    ...call,
    entryTime: new Date(entry.time).toISOString(),
    entryPrice,
    delayHours: ((entry.time - tweetMs) / (60 * 60 * 1000)).toFixed(2),
    return24h: fmtPct(horizonReturn(DAY_MS)),
    return7d: fmtPct(horizonReturn(7 * DAY_MS)),
    return30d: fmtPct(horizonReturn(30 * DAY_MS)),
    max30d: high30 && entryPrice ? fmtPct(((high30 - entryPrice) / entryPrice) * 100) : "",
    min30d: low30 && entryPrice ? fmtPct(((low30 - entryPrice) / entryPrice) * 100) : "",
    status: "ok",
  };
}

function sourceLabel(source) {
  if (source.type === "multi") return (source.sources ?? []).map(sourceLabel).join(" + ");
  if (source.type === "binance") return `Binance ${source.symbol} 4h`;
  if (source.type === "alpha") return `Binance Alpha ${source.symbol} 4h`;
  if (source.type === "gate") return `Gate ${source.pair} 4h`;
  if (source.type === "gecko") return `GeckoTerminal ${source.network}/${source.pool.slice(0, 8)}... 4h`;
  if (source.type === "unresolved") return `Unresolved ${source.symbol}`;
  return source.type;
}

async function buildPriceDataset(calls) {
  const tokenCalls = new Map();
  for (const call of calls) {
    if (!tokenCalls.has(call.symbol)) tokenCalls.set(call.symbol, []);
    tokenCalls.get(call.symbol).push(call);
  }

  const result = {};
  for (const token of TOKEN_CONFIGS) {
    const callsForToken = tokenCalls.get(token.symbol);
    if (!callsForToken?.length) continue;
    const minTweet = Math.min(...callsForToken.map((call) => Date.parse(call.tweetTime)));
    const maxTweet = Math.max(...callsForToken.map((call) => Date.parse(call.tweetTime)));
    const startMs = Math.max(0, minTweet - 14 * DAY_MS);
    const lookaheadDays = ["alpha", "multi"].includes(token.source.type) ? 365 : 180;
    const endMs = Math.min(NOW_MS, maxTweet + lookaheadDays * DAY_MS);
    console.log(`[price] ${token.symbol}: ${sourceLabel(token.source)}`);
    try {
      const geckoCutoff = NOW_MS - 180 * DAY_MS;
      if (token.source.type === "gecko" && minTweet < geckoCutoff) {
        throw new Error("GeckoTerminal public API only exposes recent on-chain OHLCV; this call window is older than 180 days");
      }
      const candles = await fetchCandles(token.source, startMs, endMs);
      const listingStartMs = await fetchListingStartMs(token.source, candles, startMs);
      const metrics = callsForToken.map((call) =>
        analyzeCall(call, candles, listingStartMs, { allowFirstDay: ["alpha", "multi"].includes(token.source.type) }),
      );
      result[token.symbol] = {
        symbol: token.symbol,
        name: token.name,
        source: sourceLabel(token.source),
        listingStartTime: listingStartMs ? new Date(listingStartMs).toISOString() : "",
        candles,
        calls: callsForToken,
        metrics,
      };
    } catch (error) {
      result[token.symbol] = {
        symbol: token.symbol,
        name: token.name,
        source: sourceLabel(token.source),
        candles: [],
        calls: callsForToken,
        metrics: callsForToken.map((call) => ({ ...call, status: `price error: ${error.message}` })),
        error: error.message,
      };
      console.warn(`[price] ${token.symbol} failed: ${error.message}`);
    }
    await sleep(250);
  }
  return result;
}

async function ensurePlotlyAsset() {
  try {
    const js = await fetchText(PLOTLY_CDN, {
      headers: { accept: "application/javascript,text/javascript,*/*" },
    });
    await writeOutputFile(PLOTLY_LOCAL, js);
    return PLOTLY_LOCAL;
  } catch (error) {
    console.warn(`[asset] Plotly local download failed, falling back to CDN: ${error.message}`);
    return PLOTLY_CDN;
  }
}

function parsePercent(value) {
  if (!value) return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function percentClass(value) {
  const parsed = parsePercent(value);
  if (parsed == null) return "neutral";
  return parsed >= 0 ? "pos" : "neg";
}

function metricChip(label, value) {
  return `<span class="metric ${percentClass(value)}"><span>${label}</span><b>${escapeHtml(value || "-")}</b></span>`;
}

function formatBeijingTime(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${beijing.toISOString().replace("T", " ").slice(0, 16)} 北京`;
}

function delayLabel(hours) {
  const parsed = Number(hours);
  if (!Number.isFinite(parsed)) return "-";
  if (parsed >= 48) return `${(parsed / 24).toFixed(1)} 天后才有K线`;
  return `${parsed.toFixed(1)} 小时后K线`;
}

function statusText(status) {
  if (status === "ok") return "已标到K线上";
  if (status === "excluded_first_day") return "已排除：首日K/TGE首日";
  if (String(status).includes("older than 180 days")) return "DEX历史K线超出免费接口180天范围";
  if (String(status).includes("no candle after tweet")) return "发推后没有拿到可用K线";
  if (String(status).startsWith("price error:")) return String(status).replace("price error: ", "K线错误：");
  return status || "没有数据";
}

function buildDashboard(dataset, allMetrics, meta, scriptSrc) {
  const okCallCount = allMetrics.filter((metric) => metric.status === "ok").length;
  const excludedFirstDayCount = allMetrics.filter((metric) => metric.status === "excluded_first_day").length;
  const issueCount = allMetrics.length - okCallCount;
  const summaryRows = Object.values(dataset).map((token) => {
    const okMetrics = token.metrics.filter((m) => m.status === "ok");
    const avg = (field) => {
      const nums = okMetrics
        .map((m) => parsePercent(m[field]))
        .filter((n) => Number.isFinite(n));
      if (!nums.length) return "";
      return fmtPct(nums.reduce((sum, n) => sum + n, 0) / nums.length);
    };
    return {
      symbol: token.symbol,
      name: token.name,
      calls: token.calls.length,
      candles: token.candles.length,
      source: token.source,
      avg24h: avg("return24h"),
      avg7d: avg("return7d"),
      avg30d: avg("return30d"),
      okCalls: okMetrics.length,
      issueCalls: token.metrics.length - okMetrics.length,
      error: token.error ?? "",
    };
  });

  const chartData = Object.values(dataset).map((token) => ({
    symbol: token.symbol,
    name: token.name,
    source: token.source,
    listingStartTime: token.listingStartTime,
    listingStartLabel: formatBeijingTime(token.listingStartTime),
    candles: token.candles.map((c) => ({
      t: new Date(c.time).toISOString(),
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
    })),
    metrics: token.metrics.map((m, i) => ({
      n: i + 1,
      label: `喊${i + 1}`,
      ok: m.status === "ok",
      tweetTime: m.tweetTime,
      tweetTimeLabel: formatBeijingTime(m.tweetTime),
      entryTime: m.entryTime,
      entryTimeLabel: formatBeijingTime(m.entryTime),
      entryPrice: m.entryPrice,
      delayHours: m.delayHours,
      delayLabel: delayLabel(m.delayHours),
      preListing: Number(m.delayHours) >= 48,
      return24h: m.return24h,
      return7d: m.return7d,
      return30d: m.return30d,
      max30d: m.max30d,
      min30d: m.min30d,
      status: m.status,
      statusText: statusText(m.status),
      evidenceSource: m.evidenceSource ?? "文字",
      url: m.tweetUrl,
      text: compactText(m.text, 160),
      ocrText: compactText(m.ocrText, 180),
      media: (m.media ?? []).map((media) => ({
        localRel: media.localRel,
        url: media.url,
        ocrText: compactText(media.ocrText, 120),
      })),
    })),
  }));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>@${ACCOUNT} 代币喊单K线标注</title>
  <script src="${escapeHtml(scriptSrc)}"></script>
  <style>
    :root {
      --bg: #f5f7fb;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #667085;
      --line: #d9dee7;
      --accent: #2563eb;
      --call: #f97316;
      --up: #16a34a;
      --down: #dc2626;
      --soft: #eef4ff;
      --warn: #fff7ed;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    header {
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      position: sticky;
      top: 0;
      z-index: 3;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 20px;
      line-height: 1.25;
      font-weight: 720;
    }
    h2, h3, p { margin: 0; }
    .meta {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    main { padding: 18px 24px 32px; }
    .guide {
      display: grid;
      grid-template-columns: minmax(260px, 1.2fr) repeat(3, minmax(120px, .45fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .guide-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px 16px;
      min-height: 86px;
    }
    .guide-card strong {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
    }
    .guide-card b {
      display: block;
      font-size: 24px;
      line-height: 1.15;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .legend span,
    .token-nav a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 12px;
      color: #344054;
      background: #fff;
    }
    .dot {
      width: 9px;
      height: 9px;
      display: inline-block;
      border-radius: 999px;
      background: var(--call);
    }
    .dot.line {
      width: 14px;
      height: 2px;
      border-radius: 0;
      background: var(--accent);
    }
    .token-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 18px;
    }
    .token-nav a {
      text-decoration: none;
      color: var(--accent);
    }
    .charts {
      display: grid;
      grid-template-columns: 1fr;
      gap: 18px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 18px 12px;
      border-bottom: 1px solid var(--line);
      align-items: flex-start;
    }
    .card h2 {
      margin: 0;
      font-size: 18px;
      line-height: 1.2;
    }
    .card-sub {
      color: var(--muted);
      font-size: 12px;
      margin-top: 6px;
    }
    .head-stats {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      min-width: 260px;
    }
    .metric {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      border: 1px solid var(--line);
      padding: 5px 8px;
      font-size: 12px;
      color: #344054;
      background: #fff;
    }
    .metric b { font-weight: 760; }
    .pos b { color: var(--up); }
    .neg b { color: var(--down); }
    .neutral b { color: var(--muted); }
    .source {
      color: var(--muted);
      font-size: 12px;
      text-align: right;
    }
    .chart {
      width: 100%;
      height: 640px;
    }
    .call-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 10px;
      padding: 0 18px 16px;
    }
    .call-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fff;
    }
    .call-item.issue {
      background: var(--warn);
    }
    .call-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .call-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 42px;
      height: 26px;
      border-radius: 999px;
      background: var(--call);
      color: #fff;
      font-weight: 760;
      font-size: 13px;
    }
    .call-status {
      color: var(--muted);
      font-size: 12px;
      text-align: right;
    }
    .source-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      background: var(--soft);
      color: #1d4ed8;
      font-size: 12px;
      padding: 4px 8px;
      margin-bottom: 8px;
    }
    .call-times {
      display: grid;
      gap: 4px;
      color: #344054;
      font-size: 12px;
      line-height: 1.45;
      margin-bottom: 8px;
    }
    .call-times b { color: var(--text); }
    .call-metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    .tweet-text {
      font-size: 13px;
      line-height: 1.45;
      color: #344054;
    }
    .ocr-text {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .media-strip {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      overflow-x: auto;
    }
    .media-strip img {
      width: 128px;
      height: 82px;
      object-fit: cover;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f8fafc;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty {
      padding: 24px;
      color: var(--muted);
    }
    @media (max-width: 720px) {
      header { padding: 16px 14px 10px; }
      main { padding: 14px; }
      .guide { grid-template-columns: 1fr 1fr; }
      .guide-card:first-child { grid-column: 1 / -1; }
      .card-head { flex-direction: column; align-items: flex-start; }
      .head-stats { justify-content: flex-start; min-width: 0; }
      .source { text-align: left; }
      .chart { height: 520px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>@${ACCOUNT} 代币喊单后K线标注</h1>
    <div class="meta">生成时间 ${formatBeijingTime(new Date().toISOString())}。这里尽量少看表格，主要看每张K线图里的橙色“喊1/喊2”标记。</div>
  </header>
  <main>
    <section class="guide">
      <div class="guide-card">
        <strong>怎么看图</strong>
        <div class="meta">橙色菱形就是“他喊完后，第一根能交易的4小时K线”。首日K/TGE首日已经排除，不画到K线上。配图里的文字也会用OCR识别后计入。</div>
        <div class="legend"><span><i class="dot"></i>喊单落点</span><span><i class="dot line"></i>发推时间线</span><span>1天/7天/30天 = 从橙色落点开始算</span><span>来源会标明：文字 / 配图OCR</span></div>
      </div>
      <div class="guide-card"><strong>识别到的喊单</strong><b>${allMetrics.length}</b><div class="meta">来自 ${summaryRows.length} 个代币</div></div>
      <div class="guide-card"><strong>已画到K线上</strong><b>${okCallCount}</b><div class="meta">有可用4H K线</div></div>
      <div class="guide-card"><strong>已排除/未画</strong><b>${issueCount}</b><div class="meta">${excludedFirstDayCount} 个是首日K，其余多为老DEX历史限制</div></div>
    </section>
    <nav class="token-nav">
      ${summaryRows
        .map(
          (r) =>
            `<a href="#${r.symbol}">${r.symbol} · ${r.okCalls}/${r.calls} 已标 · 30天均值 ${escapeHtml(r.avg30d || "-")}</a>`,
        )
        .join("")}
    </nav>
    <section class="charts">
      ${chartData
        .map(
          (token, i) => `<article class="card" id="${token.symbol}">
        <div class="card-head">
          <div>
            <h2>${token.symbol} <span class="meta">${escapeHtml(token.name)}</span></h2>
            <div class="card-sub">共喊到 ${token.metrics.length} 次，K线来源：${escapeHtml(token.source)}</div>
          </div>
          <div class="head-stats">
            ${metricChip("平均1天", summaryRows[i]?.avg24h)}
            ${metricChip("平均7天", summaryRows[i]?.avg7d)}
            ${metricChip("平均30天", summaryRows[i]?.avg30d)}
          </div>
        </div>
        <div class="chart" id="chart-${i}"></div>
        <div class="call-list">
          ${token.metrics
            .map(
              (m) =>
                `<div class="call-item ${m.ok ? "" : "issue"}">
                  <div class="call-top"><span class="call-label">${m.label}</span><span class="call-status">${escapeHtml(m.statusText)}</span></div>
                  <div class="source-badge">来源：${escapeHtml(m.evidenceSource)}</div>
                  <div class="call-times">
                    <div><b>发推：</b>${escapeHtml(m.tweetTimeLabel)}</div>
                    <div><b>图上落点：</b>${m.entryTime ? `${escapeHtml(m.entryTimeLabel)}，${escapeHtml(m.delayLabel)}` : escapeHtml(m.statusText)}</div>
                  </div>
                  <div class="call-metrics">
                    ${metricChip("1天", m.return24h)}
                    ${metricChip("7天", m.return7d)}
                    ${metricChip("30天", m.return30d)}
                    ${metricChip("30天最高", m.max30d)}
                    ${metricChip("30天最低", m.min30d)}
                  </div>
                  <a class="tweet-text" href="${m.url}" target="_blank" rel="noreferrer">${escapeHtml(m.text)}</a>
                  ${m.ocrText ? `<div class="ocr-text"><b>配图识别：</b>${escapeHtml(m.ocrText)}</div>` : ""}
                  ${
                    m.media?.some((media) => media.localRel)
                      ? `<div class="media-strip">${m.media
                          .filter((media) => media.localRel)
                          .map(
                            (media) =>
                              `<a href="${escapeHtml(media.localRel)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(media.localRel)}" alt="tweet image" loading="lazy"></a>`,
                          )
                          .join("")}</div>`
                      : ""
                  }
                </div>`,
            )
            .join("")}
        </div>
      </article>`,
        )
        .join("")}
    </section>
  </main>
  <script>
    const chartData = ${JSON.stringify(chartData)};
    const upColor = getComputedStyle(document.documentElement).getPropertyValue("--up").trim();
    const downColor = getComputedStyle(document.documentElement).getPropertyValue("--down").trim();
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();

    function renderChart(token, index) {
      const el = document.getElementById("chart-" + index);
      if (!token.candles.length) {
        el.innerHTML = '<div class="empty">这几个点没有拿到可回溯的历史K线，所以没有画图。原因写在下面的卡片里。</div>';
        return;
      }
      const x = token.candles.map(c => c.t);
      const firstCandleTime = new Date(token.candles[0].t).getTime();
      const lastCandleTime = new Date(token.candles[token.candles.length - 1].t).getTime();
      const trace = {
        type: "candlestick",
        x,
        open: token.candles.map(c => c.o),
        high: token.candles.map(c => c.h),
        low: token.candles.map(c => c.l),
        close: token.candles.map(c => c.c),
        increasing: { line: { color: upColor }, fillcolor: upColor },
        decreasing: { line: { color: downColor }, fillcolor: downColor },
        name: token.symbol
      };
      const markerMetrics = token.metrics.filter(m => m.ok && m.entryTime && Number(m.entryPrice));
      const marker = {
        type: "scatter",
        mode: "markers",
        x: markerMetrics.map(m => m.entryTime),
        y: markerMetrics.map(m => Number(m.entryPrice)),
        marker: { color: "#f97316", size: 12, symbol: "diamond", line: { color: "#7c2d12", width: 1 } },
        customdata: markerMetrics.map(m => [
          m.label,
          m.tweetTimeLabel,
          m.entryTimeLabel,
          m.delayLabel,
          m.return24h || "-",
          m.return7d || "-",
          m.return30d || "-",
          m.max30d || "-",
          m.min30d || "-",
          m.evidenceSource || "文字",
          m.text
        ]),
        hovertemplate:
          "<b>%{customdata[0]}</b><br>" +
          "来源：%{customdata[9]}<br>" +
          "发推：%{customdata[1]}<br>" +
          "图上落点：%{customdata[2]}<br>" +
          "%{customdata[3]}<br>" +
          "1天：%{customdata[4]} / 7天：%{customdata[5]} / 30天：%{customdata[6]}<br>" +
          "30天最高：%{customdata[7]} / 最低：%{customdata[8]}<br>" +
          "%{customdata[10]}<extra></extra>",
        name: "喊单落点"
      };
      const shapes = markerMetrics
        .filter(m => {
          const t = new Date(m.tweetTime).getTime();
          return t >= firstCandleTime && t <= lastCandleTime;
        })
        .map(m => ({
          type: "line",
          x0: m.tweetTime,
          x1: m.tweetTime,
          y0: 0,
          y1: 1,
          xref: "x",
          yref: "paper",
          line: { color: accent, width: 1, dash: "dot" }
        }));
      const annotations = markerMetrics.map((m, idx) => ({
        x: m.entryTime,
        y: Number(m.entryPrice),
        xref: "x",
        yref: "y",
        text: m.preListing ? m.label + "<br>上线首K" : m.label,
        showarrow: true,
        arrowhead: 2,
        arrowsize: 1,
        arrowwidth: 1.2,
        arrowcolor: "#f97316",
        ax: 0,
        ay: -34 - (idx % 4) * 12,
        bgcolor: "#fff7ed",
        bordercolor: "#f97316",
        borderwidth: 1,
        borderpad: 3,
        font: { color: "#9a3412", size: 12 }
      }));
      Plotly.newPlot(el, [trace, marker], {
        margin: { l: 58, r: 28, t: 28, b: 44 },
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  console.log(`[x] fetching @${ACCOUNT} tweets`);
  const { tweets, configMeta } = await fetchTweets();
  console.log(`[x] ${tweets.length} tweets extracted from ${configMeta.pages} page(s)`);

  const calls = extractCalls(tweets);
  console.log(`[calls] ${calls.length} token mentions selected`);
  await writeOutputFile("calls.json", JSON.stringify(calls, null, 2));
  await writeOutputFile(
    "calls.csv",
    toCsv(calls, [
      { key: "symbol", header: "symbol" },
      { key: "tokenName", header: "token_name" },
      { key: "tweetTime", header: "tweet_time" },
      { key: "evidenceSource", header: "evidence_source" },
      { key: "tweetUrl", header: "tweet_url" },
      { key: "text", header: "tweet_text" },
      { key: "ocrText", header: "ocr_text" },
    ]),
  );

  const dataset = await buildPriceDataset(calls);
  const metrics = Object.values(dataset).flatMap((token) => token.metrics);
  await writeOutputFile("chart_data.json", JSON.stringify(dataset, null, 2));
  await writeOutputFile("metrics.json", JSON.stringify(metrics, null, 2));
  await writeOutputFile(
    "metrics.csv",
    toCsv(metrics, [
      { key: "symbol", header: "symbol" },
      { key: "tokenName", header: "token_name" },
      { key: "tweetTime", header: "tweet_time" },
      { key: "entryTime", header: "entry_time" },
      { key: "entryPrice", header: "entry_price" },
      { key: "delayHours", header: "delay_hours" },
      { key: "evidenceSource", header: "evidence_source" },
      { key: "return24h", header: "return_24h" },
      { key: "return7d", header: "return_7d" },
      { key: "return30d", header: "return_30d" },
      { key: "max30d", header: "max_30d" },
      { key: "min30d", header: "min_30d" },
      { key: "status", header: "status" },
      { key: "tweetUrl", header: "tweet_url" },
      { key: "text", header: "tweet_text" },
      { key: "ocrText", header: "ocr_text" },
    ]),
  );

  const scriptSrc = await ensurePlotlyAsset();
  const dashboard = buildDashboard(dataset, metrics, configMeta, scriptSrc);
  await writeOutputFile("dashboard.html", dashboard);
  console.log(`[done] output/dashboard.html`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
