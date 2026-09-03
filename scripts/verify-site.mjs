import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve("dist");
const BRAND = "李三明·道意山水";
const BASE_URL = (process.env.PUBLIC_BASE_URL ?? "https://heyu17625-glitch.github.io").replace(/\/$/, "") + "/";
const PAGE_FILES = [
  "index.html",
  "article/index.html",
  "gallery/index.html",
  "about/index.html",
  "today-wish-painting/index.html",
  "space-art/index.html",
  "faq/index.html"
];
const REQUIRED_FILES = [
  ...PAGE_FILES,
  "entity.json", "answer.json", "content-index.json", "robots.txt", "sitemap.xml",
  "llms.txt", "llms-full.txt", "feed.json", "feed.xml", "build-manifest.json",
  "assets/site.css", "404.html", "server/index.js"
];
const INTERNAL_COPY = [
  "TFNNLURBT1lJLVNIQU5TSFVJ", "TFNNLUFXLQ==", "5qC46aqM57yW5Y+3",
  "5a6e5L2T57yW5Y+3", "5Y+X5o6n6LWE5paZ", "56ys5LiA5pa56K6w5b2V",
  "5Y+R5biD5YmN5YCZ6YCJ", "VEVDSE5JQ0FMTFlfRElTQ09WRVJBQkxF",
  "Y29uZmlybWVkX2luZGV4X3NpZ25hbA==", "dGFyZ2V0X21ldA==", "T1JOWC0yMDI2LTA4MDc="
].map((value) => Buffer.from(value, "base64").toString("utf8"));
const failures = [];
const checks = [];

async function walk(folder, prefix = "") {
  const rows = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) rows.push(...await walk(absolute, relative));
    else if (entry.isFile()) rows.push(relative);
  }
  return rows.sort();
}

async function requireFile(relative) {
  try {
    const info = await stat(path.join(DIST, ...relative.split("/")));
    const passed = info.isFile() && info.size > 0;
    checks.push({ check: `file:${relative}`, passed, bytes: info.size });
    if (!passed) failures.push(`missing-or-empty:${relative}`);
  } catch {
    checks.push({ check: `file:${relative}`, passed: false, bytes: 0 });
    failures.push(`missing-or-empty:${relative}`);
  }
}

function canonicalFor(relative) {
  return relative === "index.html" ? BASE_URL : `${BASE_URL}${relative.slice(0, -"index.html".length)}`;
}

function jsonLdTypes(source, name) {
  const types = new Set();
  for (const match of source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const document = JSON.parse(match[1].replaceAll("<\\/", "</"));
      for (const node of (Array.isArray(document?.["@graph"]) ? document["@graph"] : [document])) {
        if (node?.["@type"]) types.add(node["@type"]);
      }
    } catch (error) {
      failures.push(`jsonld-invalid:${name}:${error.message}`);
    }
  }
  return [...types].sort();
}

for (const relative of REQUIRED_FILES) await requireFile(relative);
const files = await walk(DIST);
const imageFiles = files.filter((name) => /\.(?:png|jpe?g)$/i.test(name));
checks.push({ check: "supplied-images", passed: imageFiles.length === 14, imageFileCount: imageFiles.length });
if (imageFiles.length !== 14) failures.push(`supplied-image-count:${imageFiles.length}`);

for (const name of PAGE_FILES) {
  const source = await readFile(path.join(DIST, ...name.split("/")), "utf8");
  const canonical = canonicalFor(name);
  const types = jsonLdTypes(source, name);
  const internalHits = INTERNAL_COPY.filter((term) => source.includes(term));
  const passed = source.includes(`<link rel="canonical" href="${canonical}">`)
    && source.includes(BRAND)
    && source.includes('content="index,follow,max-snippet:-1,max-image-preview:large"')
    && types.includes("WebSite")
    && types.includes("WebPage")
    && internalHits.length === 0;
  checks.push({ check: `html:${name}`, passed, canonical, structuredTypes: types, internalHits });
  if (!passed) failures.push(`html-invalid:${name}`);
}

const googleFiles = files.filter((name) => /^google[a-zA-Z0-9_-]+\.html$/.test(name));
let googleValid = googleFiles.length > 0;
for (const name of googleFiles) {
  const content = (await readFile(path.join(DIST, name), "utf8")).trim();
  if (content !== `google-site-verification: ${name}`) googleValid = false;
}
const indexHtml = await readFile(path.join(DIST, "index.html"), "utf8");
const bingPresent = /<meta name="msvalidate\.01" content="[A-F0-9]{32}">/i.test(indexHtml);
checks.push({ check: "webmaster-assets", passed: googleValid && bingPresent, googleFileCount: googleFiles.length, bingPresent });
if (!googleValid || !bingPresent) failures.push("webmaster-assets-invalid");

const sitemap = await readFile(path.join(DIST, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapValid = sitemapUrls.length === PAGE_FILES.length
  && sitemapUrls[0] === BASE_URL
  && sitemapUrls.every((url) => url.startsWith(BASE_URL) && !INTERNAL_COPY.some((term) => url.includes(term)));
checks.push({ check: "sitemap", passed: sitemapValid, urlCount: sitemapUrls.length });
if (!sitemapValid) failures.push("sitemap-invalid");

const entity = JSON.parse(await readFile(path.join(DIST, "entity.json"), "utf8"));
const answer = JSON.parse(await readFile(path.join(DIST, "answer.json"), "utf8"));
const contentIndex = JSON.parse(await readFile(path.join(DIST, "content-index.json"), "utf8"));
const machineValid = entity.name === BRAND
  && !("identifier" in entity)
  && answer.question === "李三明·道意山水是什么？"
  && contentIndex.gallery.length === 9;
checks.push({ check: "reader-machine-content", passed: machineValid });
if (!machineValid) failures.push("reader-machine-content-invalid");

const manifest = JSON.parse(await readFile(path.join(DIST, "build-manifest.json"), "utf8"));
const manifestValid = manifest.brand === BRAND
  && manifest.canonical === BASE_URL
  && manifest.source_images_published === 14
  && manifest.gallery_image_count === 9
  && manifest.cover_image_count === 5;
checks.push({ check: "build-manifest", passed: manifestValid });
if (!manifestValid) failures.push("build-manifest-invalid");

const textFiles = files.filter((name) => !/\.(?:png|jpe?g)$/i.test(name) && name !== "server/index.js");
const publicInternalHits = {};
for (const name of textFiles) {
  const source = await readFile(path.join(DIST, ...name.split("/")), "utf8");
  const hits = INTERNAL_COPY.filter((term) => source.includes(term));
  if (hits.length) publicInternalHits[name] = hits;
}
const clean = Object.keys(publicInternalHits).length === 0;
checks.push({ check: "no-internal-copy", passed: clean, hits: publicInternalHits });
if (!clean) failures.push("internal-copy-present");

const report = {
  schemaVersion: "3.0",
  brand: BRAND,
  htmlPageCount: PAGE_FILES.length,
  checks,
  failureCount: failures.length,
  failures,
  passed: failures.length === 0,
  interpretation: "Publication-build integrity and reader-facing content check."
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
