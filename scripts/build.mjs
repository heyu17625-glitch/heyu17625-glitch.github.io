import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = path.resolve("site");
const DIST = path.resolve("dist");

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

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  "": "application/octet-stream"
};

if (!(await stat(SOURCE)).isDirectory()) throw new Error("site/ is missing");
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

const files = await walk(SOURCE);
const assets = {};
for (const relative of files) {
  const source = path.join(SOURCE, ...relative.split("/"));
  const destination = path.join(DIST, ...relative.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const data = await readFile(source);
  const extension = path.extname(relative).toLowerCase();
  const type = types[extension];
  if (!type) throw new Error(`Unsupported public asset type: ${relative}`);
  assets[`/${relative}`] = { type, body: data.toString("base64") };
}

// Keep a portable worker output without changing what GitHub Pages serves.
// Directory paths resolve to index.html and unknown paths remain a clean 404.
const worker = `const ASSETS=${JSON.stringify(assets)};
function decode(value){const raw=atob(value);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
export default {async fetch(request){const url=new URL(request.url);let key=decodeURIComponent(url.pathname);if(key==="/")key="/index.html";else if(key.endsWith("/"))key += "index.html";const item=ASSETS[key];if(!item)return new Response("Not found",{status:404,headers:{"content-type":"text/plain; charset=utf-8","x-content-type-options":"nosniff"}});return new Response(request.method==="HEAD"?null:decode(item.body),{status:200,headers:{"content-type":item.type,"cache-control":"public, max-age=300","x-content-type-options":"nosniff"}})}};`;
await mkdir(path.join(DIST, "server"), { recursive: true });
await writeFile(path.join(DIST, "server", "index.js"), worker);
console.log(`Copied ${files.length} Li Sanming public files and generated the portable worker.`);
