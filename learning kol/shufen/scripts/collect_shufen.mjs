#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URLS = [
  "https://twstalker.com/shufen46250836",
  "https://twstalker.com/shufen4625057",
  "https://twiscan.com/x/shufen46250836",
];

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rawDir = join(ROOT, "raw");

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function cleanText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCandidatePosts(text, source) {
  const posts = [];
  const chunks = text.split(/shu fen\s*@shufen46250836|@shufen46250836/g);

  for (const chunk of chunks.slice(1)) {
    const trimmed = chunk
      .replace(/\b\d+\s+\d+\s+\d+\s+\d+K?\s+\d+\b/g, " ")
      .replace(/View Details[\s\S]*$/i, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (trimmed.length < 40) continue;

    const textSnippet = trimmed.slice(0, 1200);
    posts.push({
      source,
      text: textSnippet,
      chars: textSnippet.length,
    });
  }

  const seen = new Set();
  return posts.filter((post) => {
    const key = post.text.slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function main() {
  await mkdir(rawDir, { recursive: true });

  const fromFile = argValue("--from-file");
  const outPrefix = argValue("--out-prefix") || "collected_posts";
  const sources = [];

  if (fromFile) {
    const path = resolve(fromFile);
    sources.push({
      source: path,
      html: await readFile(path, "utf8"),
    });
  } else {
    const urlArg = argValue("--url");
    const urls = urlArg ? [urlArg] : DEFAULT_URLS;
    for (const url of urls) {
      try {
        const html = await fetchText(url);
        sources.push({ source: url, html });
        await writeFile(
          join(rawDir, `${basename(url).replace(/[^a-z0-9_-]/gi, "_") || "page"}.html`),
          html,
          "utf8",
        );
      } catch (error) {
        console.error(`fetch failed: ${url}: ${error.message}`);
      }
    }
  }

  const posts = [];
  for (const item of sources) {
    posts.push(...extractCandidatePosts(cleanText(item.html), item.source));
  }

  const jsonl = posts.map((post) => JSON.stringify(post)).join("\n");
  const md = [
    "# collected shufen posts",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    ...posts.map(
      (post, index) =>
        `## ${index + 1}\n\nSource: ${post.source}\n\n${post.text}\n`,
    ),
  ].join("\n");

  await writeFile(join(rawDir, `${outPrefix}.jsonl`), jsonl + (jsonl ? "\n" : ""), "utf8");
  await writeFile(join(rawDir, `${outPrefix}.md`), md, "utf8");

  console.log(`sources=${sources.length} posts=${posts.length}`);
  console.log(`wrote ${join(rawDir, `${outPrefix}.jsonl`)}`);
  console.log(`wrote ${join(rawDir, `${outPrefix}.md`)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
