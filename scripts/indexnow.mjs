// Maklumkan Bing (dan enjin carian lain yang menyokong IndexNow) tentang halaman yang baru berubah.
// Dijalankan oleh .github/workflows/deploy.yml selepas laman diterbitkan.
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HOST = "zackahmad.my";
const keyFile = (await fs.readdir(ROOT)).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) { console.log("Tiada fail kunci IndexNow."); process.exit(0); }
const key = keyFile.replace(".txt", "");

let urls = [];
try { urls = JSON.parse(await fs.readFile(path.join(ROOT, "indexnow-urls.json"), "utf8")); } catch { /* tiada */ }
if (!urls.length) { console.log("Tiada halaman berubah. IndexNow tidak dihantar."); process.exit(0); }

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList: urls.slice(0, 10000) }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} – ${urls.length} URL`);
urls.forEach((u) => console.log("  " + u));
// 200/202 = diterima. Jangan gagalkan deploy jika IndexNow bermasalah.
