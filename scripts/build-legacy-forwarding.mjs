import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(".");
const SOURCE = path.join(ROOT, "site");
const OUTPUT = path.resolve("legacy-dist");
const DESTINATION = "https://daoyishanshui.pages.dev/";
const PAGE_FILES = ["index.html", "about/index.html", "article/index.html", "gallery/index.html", "space-art/index.html", "today-wish-painting/index.html", "faq/index.html"];
assert.equal(path.dirname(OUTPUT), ROOT);
assert.notEqual(OUTPUT, SOURCE);
await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
await cp(SOURCE, OUTPUT, { recursive: true });

function forwardingHtml(relative) {
  const target = relative === "404.html" ? DESTINATION : new URL(relative === "index.html" ? "" : relative.replace(/index\.html$/, ""), DESTINATION).href;
  const baseForScript = JSON.stringify(DESTINATION);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>李三明·道意山水</title><link rel="canonical" href="${target}">
<meta name="robots" content="index,follow"><meta http-equiv="refresh" content="0;url=${target}">
<script>const target=new URL(${baseForScript});target.pathname=location.pathname.replace(/index\\.html$/,"" );target.search=location.search;target.hash=location.hash;location.replace(target.href);</script>
<style>body{max-width:40rem;margin:15vh auto;padding:2rem;font:1.1rem/1.8 serif;background:#f5f1e8;color:#17231d}a{color:inherit}</style></head>
<body><h1>李三明·道意山水</h1><p>网站已迁至新地址。</p><p><a href="${target}">前往李三明·道意山水网站</a></p></body></html>\n`;
}

for (const relative of [...PAGE_FILES, "404.html"]) {
  const content = forwardingHtml(relative);
  await writeFile(path.join(OUTPUT, relative), content);
  assert(content.includes('content="0;url=https://daoyishanshui.pages.dev/'));
  assert(content.includes("location.replace(target.href)"));
  assert(!content.includes('class="hero-copy"'));
}
for (const name of ["google3f4f22f5d3d62d32.html", "googleea3f3dbebc16c54c.html"]) {
  assert.deepEqual(await readFile(path.join(OUTPUT, name)), await readFile(path.join(SOURCE, name)));
}
const manifest = JSON.parse(await readFile(path.join(OUTPUT, "build-manifest.json"), "utf8"));
manifest.file_sha256 = {};
async function collectHashes(folder, prefix = "") {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await collectHashes(path.join(folder, entry.name), relative);
    else if (entry.isFile() && relative !== "build-manifest.json") {
      manifest.file_sha256[relative] = createHash("sha256").update(await readFile(path.join(folder, entry.name))).digest("hex");
    }
  }
}
await collectHashes(OUTPUT);
await writeFile(path.join(OUTPUT, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ htmlForwardingPages: PAGE_FILES.length + 1, googleFilesPreserved: 2, destination: DESTINATION, mechanism: "HTML refresh and browser navigation; not HTTP 301" }));
