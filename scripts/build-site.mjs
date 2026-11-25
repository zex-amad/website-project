// Bina laman statik untuk GitHub Pages.
// - Salin fail laman (index.html, admin.html, img/, ...) ke _site/
// - Jana satu halaman untuk setiap listing: /hartanah/{slug}/
// - Jana /rumah-dijual/, /terjual/ dan halaman kawasan /rumah-dijual/{negeri}/{kawasan}/
// - Pra-isi kad listing di laman utama (untuk Google), jana sitemap.xml dan kemas kini llms.txt
//
// Dijalankan oleh .github/workflows/deploy.yml. Tiada pakej luar diperlukan (Node 20+).
// Uji di komputer: node scripts/build-site.mjs   (atau LISTINGS_JSON=fail.json untuk data contoh)

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "_site");
const SITE = "https://zackahmad.my";
const SB_URL = "https://ukblmuvaymkoszpcsxie.supabase.co";
const SB_KEY = "sb_publishable_cHiug_yiGs3kPzNvSrOyWg_UwbKMICU"; // kunci awam (dilindungi RLS)
const WA = "60196071970";
const EXCLUDE = new Set([".git", ".github", "scripts", "supabase", "data", "_site", "node_modules", "README.md", "sitemap.xml", "indexnow-urls.json"]);

// Kawasan tetap di laman utama (mesti sama dengan senarai AREAS dalam index.html)
const AREAS = [
  ["Shah Alam", "Selangor"], ["Petaling Jaya", "Selangor"], ["Subang Jaya", "Selangor"], ["Klang", "Selangor"],
  ["Puchong", "Selangor"], ["Cheras", "Kuala Lumpur"], ["Kajang", "Selangor"], ["Bangi", "Selangor"],
  ["Sungai Buloh", "Selangor"], ["Kota Damansara", "Selangor"], ["Rawang", "Selangor"], ["Selayang", "Selangor"],
  ["Gombak", "Selangor"], ["Ampang", "Selangor"], ["Setia Alam", "Selangor"], ["Puncak Alam", "Selangor"],
  ["Seri Kembangan", "Selangor"], ["Semenyih", "Selangor"], ["Cyberjaya", "Selangor"], ["Putrajaya", "Putrajaya"],
];
const BULAN = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];

/* ---------------- helpers ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const num = (n) => (n === null || n === undefined || n === "" ? null : Number(n).toLocaleString("en-MY"));
const slugFor = (l) => l.slug || slugify([l.jenis, l.taman, l.kawasan, l.id].filter(Boolean).join(" "));
const listingPath = (l) => `/hartanah/${slugFor(l)}/`;
const areaPath = (kawasan, negeri) => `/rumah-dijual/${slugify(negeri || "Selangor")}/${slugify(kawasan)}/`;
const titleOf = (l) => `${l.jenis} di ${l.taman}${l.kawasan ? ", " + l.kawasan : ""}`;
const soldWhen = (l) => {
  if (!l.tarikh_terjual) return "Terjual";
  const d = new Date(l.tarikh_terjual);
  return `Terjual ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
};
const fmtDate = (d) => { if (!d) return ""; const x = new Date(d); return `${x.getDate()} ${BULAN[x.getMonth()]} ${x.getFullYear()}`; };
const monthly = (harga) => {
  const loan = Number(harga) * 0.9, r = 0.042 / 12, n = 35 * 12;
  return Math.round((loan * r) / (1 - Math.pow(1 + r, -n)) / 10) * 10;
};
const lines = (t) => String(t || "").split(/\r?\n/).map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
function autoSummary(l) {
  const sold = l.status === "terjual";
  const perKps = l.harga && l.keluasan_kps ? num(Math.round(l.harga / l.keluasan_kps)) : null;
  const where = [l.taman, l.kawasan, l.negeri].filter(Boolean).join(", ");
  const head = `${l.jenis}${l.status_lot ? " lot " + l.status_lot : ""} di ${where}`;
  const specs = [l.bilik != null ? `${l.bilik} bilik` : "", l.bilik_air != null ? `${l.bilik_air} bilik air` : "",
    l.keluasan_kps != null ? `keluasan binaan ${num(l.keluasan_kps)} kps` : ""].filter(Boolean).join(", ");
  const extra = [l.keluasan_tanah ? `atas tanah ${l.keluasan_tanah}` : "", l.arah ? String(l.arah).toLowerCase() : ""].filter(Boolean).join(", ");
  const parts = [
    sold ? `${head}, telah dijual (${soldWhen(l).toLowerCase()}).` : `${head}, untuk dijual pada RM ${num(l.harga)}${perKps ? ` (kira-kira RM ${perKps} sekaki persegi)` : ""}.`,
    specs ? `${specs.charAt(0).toUpperCase() + specs.slice(1)}${extra ? ", " + extra : ""}${l.pegangan ? `, ${String(l.pegangan).toLowerCase()}` : ""}.` : "",
    l.keadaan ? `Keadaan: ${String(l.keadaan).toLowerCase()}${l.perabot ? `, ${String(l.perabot).toLowerCase()}` : ""}.` : "",
    "Diuruskan oleh Zack Ahmad, Perunding Hartanah Berdaftar REN 36121.",
  ];
  return parts.filter(Boolean).join(" ");
}
function faqFor(l) {
  const sold = l.status === "terjual";
  const q = [];
  if (sold) {
    q.push([`Ada rumah serupa untuk dijual di ${l.kawasan}?`, `Rumah ini sudah terjual. WhatsApp Zack Ahmad di +6019-607 1970 untuk senarai rumah terkini di ${l.kawasan}, atau lihat halaman rumah dijual di ${l.kawasan}.`]);
    return q;
  }
  const perKps = l.harga && l.keluasan_kps ? num(Math.round(l.harga / l.keluasan_kps)) : null;
  if (l.harga) q.push([`Berapa harga ${l.jenis.toLowerCase()} di ${l.taman} ini?`, `RM ${num(l.harga)}${perKps ? `, iaitu kira-kira RM ${perKps} sekaki persegi untuk keluasan binaan ${num(l.keluasan_kps)} kps` : ""}.`]);
  if (l.harga) q.push(["Berapa anggaran bayaran bulanan?", `Sekitar RM ${num(monthly(l.harga))} sebulan untuk pinjaman 90% selama 35 tahun pada kadar 4.2% setahun. Kadar sebenar bergantung pada bank dan kelayakan anda.`]);
  if (l.status_lot || l.pegangan) q.push(["Apakah status lot dan pegangan rumah ini?", [l.status_lot ? `Lot ${l.status_lot}` : "", l.pegangan ? `pegangan ${String(l.pegangan).toLowerCase()}` : ""].filter(Boolean).join(", ") + "."]);
  if (l.yuran_penyelenggaraan) q.push(["Berapa yuran penyelenggaraan?", `RM ${num(l.yuran_penyelenggaraan)} sebulan.`]);
  q.push(["Bagaimana nak lawat atau buat tawaran?", `WhatsApp Zack Ahmad (REN 36121) di +6019-607 1970 dan sebut ID listing #${l.id} untuk tetapkan masa lawatan.`]);
  return q;
}
const waLink = (text) => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
const photos = (l) => (Array.isArray(l.gambar) ? l.gambar : []).map((g) => g && g.url).filter(Boolean);

async function write(rel, content) {
  const file = path.join(OUT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name) || entry.name.startsWith(".")) continue;
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

/* ---------------- data ---------------- */
let REVIEWS = null;
const GUIDES = new Map(); // panduan kawasan: data/kawasan/{slug-kawasan}.json
// _asas.json: bahagian servis/proses/FAQ yang sama untuk semua kawasan ({kawasan} diganti nama kawasan).
// Fail kawasan hanya perlu maklumat khusus kawasan; apa-apa medan dalam fail kawasan mengatasi asas.
let ASAS = {};
try { ASAS = JSON.parse(await fs.readFile(path.join(ROOT, "data", "kawasan", "_asas.json"), "utf8")); } catch { /* tiada asas */ }
const fill = (v, k) => JSON.parse(JSON.stringify(v).replaceAll("{kawasan}", String(k).replace(/["\\]/g, "")));
// Panduan automatik untuk kawasan baru (dari admin / listing) yang belum ada fail data/kawasan/*.json.
// Hanya teks umum tentang servis Zack: tiada fakta kawasan yang belum disemak.
function autoGuide(k, negeri, tarikh) {
  return {
    ...fill(ASAS, k), kawasan: k, negeri: negeri || "Selangor", daerah: negeri || "Selangor", auto: true,
    dikemaskini: (tarikh || new Date().toISOString()).slice(0, 10),
    ringkasan: `Saya Zack Ahmad, Perunding Hartanah Berdaftar (REN 36121) yang aktif membantu pemilik menjual hartanah di ${k}: rumah teres, semi-D, banglo, flat, pangsapuri, kondominium, townhouse, tanah, kedai komersial dan kilang. Matlamat saya: hartanah anda terjual cepat pada harga yang munasabah, dan pembeli rasa berbaloi.`,
    tentang: { tajuk: `Menjual hartanah di ${k}`, perenggan: [
      `Setiap taman dan projek di ${k} ada pembeli dan julat harga tersendiri. Rumah di taman yang sama pun boleh berbeza harga ikut kedudukan lot, keadaan, ubah suai dan status pegangan. Sebab itu saya tidak menetapkan harga berdasarkan purata kawasan, tetapi berdasarkan transaksi sebenar yang paling hampir dengan hartanah anda.`,
      `Sebagai perunding hartanah berdaftar, saya menguruskan proses jualan dari awal hingga kunci diserahkan: kajian nilai bank dan harga pasaran, pemasaran, tapisan pembeli yang layak pinjaman, rundingan, serta penyelarasan dengan peguam dan bank. Anda tidak perlu melayan setiap pertanyaan sendiri.`,
    ] },
  };
}
try {
  for (const f of await fs.readdir(path.join(ROOT, "data", "kawasan"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const g = JSON.parse(await fs.readFile(path.join(ROOT, "data", "kawasan", f), "utf8"));
    const merged = { ...fill(ASAS, g.kawasan), ...g };
    if (g.faq_tambahan) merged.faq = [...g.faq_tambahan, ...(merged.faq || [])];
    GUIDES.set(slugify(g.kawasan), merged);
  }
} catch { /* tiada panduan */ }
export const INDEXNOW_KEY = "d79b637a3c99c35e28393fa9726a879a";
try { REVIEWS = JSON.parse(await fs.readFile(path.join(ROOT, "data", "reviews.json"), "utf8")); } catch { /* tiada ulasan */ }
async function loadKawasan() {
  if (process.env.KAWASAN_JSON) return JSON.parse(await fs.readFile(process.env.KAWASAN_JSON, "utf8"));
  if (process.env.LISTINGS_JSON) return [];
  try {
    const res = await fetch(`${SB_URL}/rest/v1/kawasan?select=*`, { headers: { apikey: SB_KEY } });
    if (!res.ok) { console.warn(`Amaran: jadual kawasan tidak dapat dibaca (${res.status}). Jalankan migration 004.`); return []; }
    return await res.json();
  } catch (e) { console.warn("Amaran: jadual kawasan:", e.message); return []; }
}
async function loadListings() {
  if (process.env.LISTINGS_JSON) return JSON.parse(await fs.readFile(process.env.LISTINGS_JSON, "utf8"));
  const url = `${SB_URL}/rest/v1/listings?select=*&status=in.(dijual,terjual)&order=urutan.asc,id.desc`;
  const res = await fetch(url, { headers: { apikey: SB_KEY } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

/* ---------------- layout ---------------- */
const CSS = `
:root{--navy:#13203A;--navy-2:#1A2A4A;--line:#33456A;--cream:#F6F3EC;--cl:#E4DED0;--photo:#E9E4D8;--accent:#D9B26A;--brass:#8A6420;--muted:#D4DBE8;--muted-2:#A9B6CF;--ink:#3B4A66;--head:"Manrope",system-ui,sans-serif;--body:"Inter",system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--navy);font-family:var(--body);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}a{color:var(--brass)}h1,h2,h3{font-family:var(--head);margin:0;line-height:1.15}p{margin:0}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:6px}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}
.top{background:var(--navy);color:var(--cream);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;padding:16px 24px;max-width:1200px;margin:0 auto}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--cream)}.brand span{font:800 15px var(--head);letter-spacing:.14em;text-transform:uppercase}
.links{display:flex;flex-wrap:wrap;align-items:center;gap:6px 22px;font-size:15px;font-weight:500}.links a:not(.btn){color:var(--muted);text-decoration:none}.links a:not(.btn):hover{color:var(--cream)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;font:600 16px/1 var(--body);text-decoration:none;padding:15px 24px;min-height:50px;border-radius:999px;border:1px solid transparent}
.btn-accent{background:var(--accent);color:var(--navy)}.btn-ghost{border-color:var(--line);color:var(--cream)}.btn-navy{background:var(--navy);color:var(--cream)}
.links .btn{padding:11px 18px;min-height:44px}
.crumb{font-size:13px;color:var(--ink);padding:18px 0 6px}.crumb a{color:var(--ink)}
.eyebrow{font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--brass)}
main{padding-bottom:72px}
.gallery{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.main-ph{position:relative;aspect-ratio:16/9;max-height:540px;width:100%;border-radius:20px;overflow:hidden;background:var(--photo);display:flex;align-items:center;justify-content:center;color:var(--ink)}
.main-ph img{width:100%;height:100%;object-fit:cover}
.thumbs{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
.thumbs button{flex:none;width:110px;height:78px;border-radius:12px;overflow:hidden;border:2px solid transparent;padding:0;background:var(--photo);cursor:pointer}
.thumbs button[aria-current="true"]{border-color:var(--navy)}.thumbs img{width:100%;height:100%;object-fit:cover}
.tag{position:absolute;top:16px;left:16px;background:var(--navy);color:var(--cream);font-size:12px;font-weight:600;letter-spacing:.12em;padding:6px 12px;border-radius:999px}.tag.sold{background:var(--brass);color:#fff}
.cols{display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start;margin-top:28px}
.detail{flex:999 1 560px;min-width:0;display:flex;flex-direction:column;gap:24px}
.price{font:800 34px var(--head)}
.facts{display:flex;flex-wrap:wrap;gap:12px}.fact{flex:1 1 120px;background:#fff;border:1px solid var(--cl);border-radius:14px;padding:16px;display:flex;flex-direction:column}
.fact span{font-size:13px;color:var(--ink)}.fact b{font:800 22px var(--head)}
.desc{font-size:16px;line-height:1.7;color:var(--ink);white-space:pre-line}
table{border-collapse:collapse;font-size:15px;width:100%;max-width:560px}th,td{text-align:left;padding:10px 0;border-bottom:1px solid var(--cl)}th{font-weight:500;color:var(--ink);width:45%}
.agent{flex:1 1 320px;max-width:380px;background:var(--navy);color:var(--cream);border-radius:24px;padding:28px;display:flex;flex-direction:column;gap:16px;position:sticky;top:96px}
.agent img{width:72px;height:72px;border-radius:999px;object-fit:cover;object-position:center top;background:#fff}
.agent small{font-size:12px;color:var(--muted-2);text-align:center}
.section{padding-top:48px;display:flex;flex-direction:column;gap:18px}
.cards{display:flex;flex-wrap:wrap;gap:20px}
.card{flex:1 1 280px;max-width:390px;text-decoration:none;color:var(--navy);background:#fff;border:1px solid var(--cl);border-radius:18px;overflow:hidden;display:flex;flex-direction:column}
.card .ph{position:relative;aspect-ratio:4/3;background:var(--photo);display:flex;align-items:center;justify-content:center;color:var(--ink);font-size:13px}
.card .ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.card .b{padding:18px;display:flex;flex-direction:column;gap:6px}.card .p{font:800 20px var(--head)}.card .t{font-weight:600}.card .m{font-size:14px;color:var(--ink)}
.chips{display:flex;flex-wrap:wrap;gap:10px}.chip{color:var(--navy);background:#fff;border:1px solid var(--cl);border-radius:999px;padding:10px 16px;text-decoration:none;font-size:15px;min-height:44px;display:inline-flex;align-items:center}
.empty{padding:28px;border:2px dashed #CFC7B5;border-radius:16px;color:var(--ink)}
.foot{background:var(--navy);color:var(--muted-2);font-size:14px;margin-top:40px}.foot .in{display:flex;flex-wrap:wrap;gap:32px;padding:48px 24px 28px;max-width:1200px;margin:0 auto}
.foot a{color:var(--muted-2)}.foot strong{color:var(--cream)}.foot nav{display:flex;flex-wrap:wrap;gap:8px 16px}
.legal{border-top:1px solid var(--line);max-width:1200px;margin:0 auto;padding:18px 24px 28px;font-size:13px}
.meta{font-size:13px;color:var(--ink)}.meta a{color:var(--ink)}
.box{background:#fff;border:1px solid var(--cl);border-radius:16px;padding:20px 22px;display:flex;flex-direction:column;gap:8px}.box h2{font-size:18px}.box p{font-size:16px;line-height:1.7}
.pay{flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between}.pay div{display:flex;flex-direction:column;gap:4px}.pay b{font:800 28px var(--head)}
.nota{background:var(--navy);color:var(--cream);border-radius:20px;padding:24px;display:flex;gap:16px;align-items:flex-start}
.nota img{width:56px;height:56px;border-radius:999px;object-fit:cover;object-position:center top;background:#fff;flex:none}
.nota h2{font-size:18px;color:var(--accent);margin-bottom:6px}.nota p{color:var(--muted);line-height:1.7;white-space:pre-line}.nota span{display:block;margin-top:8px;font-size:13px;color:var(--muted-2)}
.near{margin:0;padding-left:20px;line-height:1.9;color:var(--ink)}
.faq{display:flex;flex-direction:column}.faq details{border-top:1px solid var(--cl);padding:14px 0}.faq details:last-child{border-bottom:1px solid var(--cl)}
.faq summary{font-weight:600;cursor:pointer}.faq p{margin-top:8px;color:var(--ink)}
.cap{position:absolute;left:16px;bottom:16px;background:rgba(19,32,58,.82);color:#fff;font-size:13px;padding:6px 12px;border-radius:999px}
.band{padding:64px 0}.band.tight{padding:0 0 64px}.band.dark{background:var(--navy);color:var(--cream)}.band.white{background:#fff}
.band-in{display:flex;flex-direction:column;gap:22px}
.g-hero{display:flex;flex-wrap:wrap;gap:40px;align-items:center;padding-bottom:16px}.g-hero-text{flex:1.5 1 480px;min-width:0;display:flex;flex-direction:column;gap:16px}
.g-h1{font-weight:800;font-size:clamp(32px,4.6vw,56px);line-height:1.08}
.g-photo{flex:1 1 260px;max-width:360px;aspect-ratio:4/5;border-radius:24px;overflow:hidden;background:#fff}.g-photo img{width:100%;height:100%;object-fit:cover;object-position:center top}
.row-btns{display:flex;flex-wrap:wrap;gap:12px}
.g-h2{font-weight:800;font-size:clamp(26px,3.4vw,40px);line-height:1.15}
.g-p{font-size:17px;line-height:1.75;color:var(--ink);max-width:820px}
.g-cards{display:flex;flex-wrap:wrap;gap:20px}.g-card{flex:1 1 340px;background:#fff;border:1px solid var(--cl);border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:10px}.g-card h3{font-size:22px;font-weight:800}.g-card p{color:var(--ink);line-height:1.7}
.g-reasons{display:flex;flex-wrap:wrap;gap:28px}.g-reasons>div{flex:1 1 300px;border-top:2px solid var(--accent);padding-top:18px;display:flex;flex-direction:column;gap:8px}
.g-reasons b{font:800 15px var(--head);color:var(--accent)}.g-reasons h3{font-size:21px;font-weight:800}.g-reasons p{color:var(--muted);line-height:1.7}
.g-work{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:14px}.g-work li{flex:1 1 340px;background:#fff;border:1px solid var(--cl);border-radius:16px;padding:20px;display:flex;gap:14px}
.g-work b{font:800 18px var(--head);color:var(--brass);min-width:28px}.g-work strong{display:block;font:700 17px var(--head);margin-bottom:4px}.g-work span{font-size:15px;line-height:1.6;color:var(--ink)}
.g-cta{flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px;padding:32px}.g-cta>div{flex:1 1 420px;display:flex;flex-direction:column;gap:6px}
.g-steps{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:20px}.g-steps li{flex:1 1 200px;border-top:2px solid var(--brass);padding-top:18px;display:flex;flex-direction:column;gap:6px}
.g-steps b{font:800 15px var(--head);color:var(--brass)}.g-steps strong{font:700 18px var(--head)}.g-steps span{font-size:15px;line-height:1.6;color:var(--ink)}
.g-cols{display:flex;flex-wrap:wrap;gap:32px}.g-cols>div{flex:1 1 300px;display:flex;flex-direction:column;gap:8px}.g-cols h3{font-size:19px;font-weight:800}
.art-wrap{display:flex;flex-wrap:wrap;gap:40px;align-items:flex-start;padding-bottom:40px}
.art{flex:999 1 600px;min-width:0;max-width:760px;display:flex;flex-direction:column;gap:18px}
.art-h1{font-weight:800;font-size:clamp(30px,4.2vw,48px);line-height:1.12}
.byline{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--ink)}.byline img{width:40px;height:40px;border-radius:999px;object-fit:cover;object-position:center top;background:#fff}.byline a{color:var(--navy);text-decoration:none}
.toc{background:#fff;border:1px solid var(--cl);border-radius:16px;padding:18px 22px}.toc strong{font:800 16px var(--head)}.toc ol{margin:8px 0 0;padding-left:0;list-style:none;line-height:1.9;font-size:15px}.toc a{color:var(--navy)}
.prose{display:flex;flex-direction:column;gap:16px;font-size:17px;line-height:1.8;color:var(--ink)}
.prose h2{font-size:28px;font-weight:800;color:var(--navy);margin-top:20px;scroll-margin-top:96px}.prose h3{font-size:21px;font-weight:800;color:var(--navy)}
.prose ul,.prose ol{margin:0;padding-left:22px}.prose li{margin:4px 0}.prose strong{color:var(--navy)}
.prose .tbl{overflow-x:auto;background:#fff;border:1px solid var(--cl);border-radius:14px}
.prose table{max-width:none;min-width:560px;font-size:15px}.prose th,.prose td{padding:12px 14px;vertical-align:top;border-bottom:1px solid var(--cl)}
.prose thead th{background:var(--navy);color:var(--cream);font-weight:600;width:auto}.prose tbody th{color:var(--navy);font-weight:600;width:28%}
.prose tbody tr:last-child th,.prose tbody tr:last-child td{border-bottom:0}
.prose .tip{background:#FBF4E6;border-radius:14px;padding:16px 18px;color:var(--navy)}
.art-cta{background:var(--navy);color:var(--cream);border-radius:20px;padding:28px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-top:16px}
.art-cta>div{flex:1 1 360px;display:flex;flex-direction:column;gap:6px}.art-cta strong{font:800 22px var(--head)}.art-cta span{color:var(--muted)}
.art-side{flex:1 1 280px;max-width:340px;display:flex;flex-direction:column;gap:16px}
@media (max-width:720px){.agent{position:static;max-width:none}.price{font-size:28px}}
`;

const HOUSE = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D9B26A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>`;

function footer() {
  const areas = AREAS.map(([k, n]) => `<a href="${areaPath(k, n)}">${esc(k)}</a>`).join("");
  return `<footer class="foot"><div class="in">
  <div style="flex:1 1 260px;display:flex;flex-direction:column;gap:8px"><strong style="font:800 18px var(--head)">Zack Ahmad</strong>
  <span>Perunding Hartanah Berdaftar REN 36121<br>Legacy Real Property Sdn Bhd<br>No 38, Jalan Cemara 8, Bandar Saujana Utama,<br>47000 Sungai Buloh, Selangor<br><a href="tel:+60196071970">+6019-607 1970</a></span></div>
  <div style="flex:2 1 380px;display:flex;flex-direction:column;gap:10px"><strong>Rumah dijual mengikut kawasan</strong><nav aria-label="Kawasan">${areas}</nav></div>
  </div><div class="legal">© ${new Date().getFullYear()} Zack Ahmad · Legacy Real Property Sdn Bhd · <a href="/">Laman utama</a> · <a href="/rumah-dijual/">Rumah dijual</a> · <a href="/terjual/">Rekod jualan</a></div></footer>`;
}

function page({ title, desc, canonical, image, jsonld, body, noindex, script = "" }) {
  return `<!doctype html>
<html lang="ms">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/img/favicon-96.png" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${canonical}">
<meta name="robots" content="${noindex ? "noindex, follow" : "index, follow"}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Zack Ahmad – Perunding Hartanah">
<meta property="og:locale" content="ms_MY">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:image" content="${esc(image || SITE + "/img/zack-ahmad.jpg")}">
<meta name="theme-color" content="#13203A">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&display=swap">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
<style>${CSS}</style>
</head>
<body>
<header class="top"><nav class="nav" aria-label="Utama">
<a href="/" class="brand">${HOUSE}<span>Legacy Real Property</span></a>
<div class="links"><a href="/">Utama</a><a href="/rumah-dijual/">Rumah Dijual</a><a href="/terjual/">Rekod Jualan</a><a href="/panduan/">Panduan</a><a href="/#hubungi">Hubungi</a>
<a href="https://wa.me/${WA}" class="btn btn-accent" target="_blank" rel="noopener">WhatsApp Sekarang</a></div>
</nav></header>
${body}
${footer()}
${script}
</body>
</html>
`;
}

const crumbLd = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + href })),
});
const crumbHtml = (items) =>
  `<nav class="crumb" aria-label="Breadcrumb">${items.map(([n, h], i) => (i === items.length - 1 ? esc(n) : `<a href="${h}">${esc(n)}</a>`)).join(" › ")}</nav>`;

function card(l) {
  const sold = l.status === "terjual";
  const ph = photos(l)[0];
  return `<a class="card" href="${listingPath(l)}">
<div class="ph">${ph ? `<img src="${esc(ph)}" alt="${esc(titleOf(l))}" loading="lazy">` : "Gambar akan dikemas kini"}<span class="tag${sold ? " sold" : ""}">${sold ? "TERJUAL" : "DIJUAL"}</span></div>
<div class="b">${sold ? `<span class="m">${esc(soldWhen(l))}</span>` : `<span class="p">${num(l.harga) ? "RM " + num(l.harga) : "Harga: hubungi"}</span>`}
<span class="t">${esc(titleOf(l))}</span>
<span class="m">${[l.bilik != null ? l.bilik + " bilik" : "", l.keluasan_kps != null ? num(l.keluasan_kps) + " kps" : "", l.pegangan].filter(Boolean).map(esc).join(" · ")}</span></div></a>`;
}

/* ---------------- listing page ---------------- */
const HOUSE_TYPES = { Pangsapuri: "Apartment", Kondominium: "Apartment", Tanah: "Place", Komersial: "Place" };

function listingPage(l, all) {
  const sold = l.status === "terjual";
  const title = titleOf(l);
  const pics = photos(l);
  const p = listingPath(l);
  const areaHref = areaPath(l.kawasan, l.negeri);
  const crumbs = [["Utama", "/"], ["Rumah Dijual", "/rumah-dijual/"], [l.negeri || "Selangor", "/rumah-dijual/"], [l.kawasan || "Kawasan", areaHref], [`${l.jenis}, ${l.taman}`, p]];
  const harga = num(l.harga);
  const perKps = l.harga && l.keluasan_kps ? num(Math.round(l.harga / l.keluasan_kps)) : null;
  const specs = [l.bilik != null ? `${l.bilik} bilik` : "", l.bilik_air != null ? `${l.bilik_air} bilik air` : "", l.keluasan_kps != null ? `${num(l.keluasan_kps)} kps` : "", l.pegangan].filter(Boolean);
  const summary = (l.ringkasan && l.ringkasan.trim()) || autoSummary(l);
  const desc = summary.length > 158 ? summary.slice(0, 155).replace(/\s+\S*$/, "") + "…" : summary;
  const faq = faqFor(l);
  const caption = (g, i) => (g && g.kapsyen) || `gambar ${i + 1}`;
  const gam = Array.isArray(l.gambar) ? l.gambar.filter((g) => g && g.url) : [];
  const askText = sold
    ? `Salam Zack, saya nampak ${title} sudah terjual. Ada rumah serupa di ${l.kawasan}?`
    : `Salam Zack, saya berminat dengan ${title} (ID #${l.id}).`;
  const similar = all
    .filter((x) => x.id !== l.id && x.status === "dijual" && slugify(x.kawasan) === slugify(l.kawasan))
    .concat(all.filter((x) => x.id !== l.id && x.status === "dijual" && slugify(x.kawasan) !== slugify(l.kawasan) && x.negeri === l.negeri))
    .slice(0, 3);

  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RealEstateListing",
        name: title,
        url: SITE + p,
        datePosted: l.created_at || undefined,
        dateModified: l.updated_at || undefined,
        image: pics.length ? pics : undefined,
        description: summary,
        offers: {
          "@type": "Offer",
          ...(sold || !l.harga ? {} : { price: Number(l.harga), priceCurrency: "MYR" }),
          availability: sold ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
          seller: { "@type": "RealEstateAgent", "@id": SITE + "/#zack", name: "Zack Ahmad", telephone: "+60196071970" },
        },
        about: {
          "@type": HOUSE_TYPES[l.jenis] || "SingleFamilyResidence",
          name: title,
          ...(l.bilik != null ? { numberOfRooms: l.bilik } : {}),
          ...(l.bilik_air != null ? { numberOfBathroomsTotal: l.bilik_air } : {}),
          ...(l.keluasan_kps != null ? { floorSize: { "@type": "QuantitativeValue", value: l.keluasan_kps, unitCode: "FTK" } } : {}),
          address: { "@type": "PostalAddress", addressLocality: l.kawasan, addressRegion: l.negeri, addressCountry: "MY" },
          additionalProperty: [["Keluasan tanah", l.keluasan_tanah], ["Status lot", l.status_lot], ["Pegangan", l.pegangan], ["Arah hadapan", l.arah], ["Keadaan", l.keadaan], ["Perabot", l.perabot],
            ["Yuran penyelenggaraan (RM/bulan)", l.yuran_penyelenggaraan]].filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([name, value]) => ({ "@type": "PropertyValue", name, value })),
        },
      },
      crumbLd(crumbs),
      { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };

  const gallery = pics.length
    ? `<div class="gallery"><figure class="main-ph" style="margin:0"><img id="main-img" src="${esc(gam[0].url)}" alt="${esc(title)} – ${esc(caption(gam[0], 0))}" fetchpriority="high"><span class="tag${sold ? " sold" : ""}">${sold ? "TERJUAL" : "DIJUAL"}</span><figcaption id="main-cap" class="cap"${gam[0].kapsyen ? "" : " hidden"}>${esc(gam[0].kapsyen || "")}</figcaption></figure>
${gam.length > 1 ? `<div class="thumbs" role="list">${gam.map((g, i) => `<button type="button" role="listitem" data-src="${esc(g.url)}" data-cap="${esc(g.kapsyen || "")}" data-alt="${esc(title)} – ${esc(caption(g, i))}" aria-label="${esc(caption(g, i))}" aria-current="${i === 0}"><img src="${esc(g.url)}" alt="${esc(title)} – ${esc(caption(g, i))}" loading="lazy"></button>`).join("")}</div>` : ""}</div>`
    : `<div class="gallery"><div class="main-ph">Gambar akan dikemas kini<span class="tag${sold ? " sold" : ""}">${sold ? "TERJUAL" : "DIJUAL"}</span></div></div>`;

  const facts = [["Bilik", l.bilik], ["Bilik air", l.bilik_air], ["Keluasan", l.keluasan_kps != null ? num(l.keluasan_kps) + " kps" : null], ["Pegangan", l.pegangan]]
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `<div class="fact"><span>${k}</span><b>${esc(v)}</b></div>`).join("");

  const rows = [["Jenis", l.jenis], ["Taman / projek", l.taman], ["Kawasan", [l.kawasan, l.negeri].filter(Boolean).join(", ")],
    !sold && perKps ? ["Harga / kps", "RM " + perKps] : null, l.keluasan_tanah ? ["Keluasan tanah", l.keluasan_tanah] : null,
    l.status_lot ? ["Status lot", l.status_lot] : null, l.arah ? ["Arah hadapan", l.arah] : null, l.keadaan ? ["Keadaan", l.keadaan] : null,
    l.perabot ? ["Perabot", l.perabot] : null, l.yuran_penyelenggaraan ? ["Yuran penyelenggaraan", `RM ${num(l.yuran_penyelenggaraan)} / bulan`] : null,
    sold ? ["Status", soldWhen(l)] : null, ["ID listing", "#" + l.id]]
    .filter(Boolean).map(([k, v]) => `<tr><th scope="row">${k}</th><td>${esc(v)}</td></tr>`).join("");

  const body = `<main class="wrap">
${crumbHtml(crumbs)}
${gallery}
<div class="cols">
<article class="detail">
<div style="display:flex;flex-direction:column;gap:10px">
<span class="eyebrow">${sold ? "Rekod jualan" : "Rumah dijual"} · ${esc([l.kawasan, l.negeri].filter(Boolean).join(", "))}</span>
<h1 style="font-weight:800;font-size:clamp(28px,4vw,44px)">${esc(title)}</h1>
${sold ? `<span class="price" style="font-size:24px;color:var(--brass)">${esc(soldWhen(l))}</span>` : `<span class="price">${harga ? "RM " + harga : "Harga: hubungi Zack"}</span>`}
<span class="meta">Diterbitkan <time datetime="${esc(l.created_at || "")}">${fmtDate(l.created_at)}</time> · Dikemas kini <time datetime="${esc(l.updated_at || "")}">${fmtDate(l.updated_at)}</time> · Oleh <a href="/">Zack Ahmad</a>, REN 36121</span>
</div>
<section class="box"><h2>Ringkasan</h2><p>${esc(summary)}</p></section>
${facts ? `<div class="facts">${facts}</div>` : ""}
${l.nota_zack && l.nota_zack.trim() ? `<section class="nota"><img src="/img/zack-ahmad.jpg" alt="Zack Ahmad" width="56" height="56"><div><h2>Nota Zack</h2><p>${esc(l.nota_zack.trim())}</p><span>Zack Ahmad · Perunding Hartanah Berdaftar REN 36121</span></div></section>` : ""}
${l.penerangan ? `<section style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:22px">Penerangan</h2><p class="desc">${esc(l.penerangan.trim())}</p></section>` : ""}
<section style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:22px">Butiran</h2><table><tbody>${rows}</tbody></table></section>
${lines(l.kemudahan).length ? `<section style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:22px">Lokasi &amp; kemudahan berdekatan</h2><ul class="near">${lines(l.kemudahan).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
${!sold && l.harga ? `<section class="box pay"><div><h2>Anggaran bayaran bulanan</h2><b>± RM ${num(monthly(l.harga))} / bulan</b><span class="meta">Pinjaman 90% · 35 tahun · 4.2% setahun. Anggaran sahaja.</span></div><a href="/#kalkulator">Kira sendiri →</a></section>` : ""}
<section class="faq"><h2 style="font-size:22px">Soalan lazim tentang rumah ini</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section>
<p><a href="${areaHref}">Lihat semua rumah di ${esc(l.kawasan)} →</a></p>
</article>
<aside class="agent" aria-label="Hubungi ejen">
<div style="display:flex;align-items:center;gap:14px"><img src="/img/zack-ahmad.jpg" alt="Zack Ahmad" width="72" height="72">
<div style="display:flex;flex-direction:column"><strong style="font:800 20px var(--head)">Zack Ahmad</strong><span style="font-size:13px;color:var(--muted-2)">Perunding Hartanah Berdaftar · REN 36121</span></div></div>
<p style="font-size:15px;color:var(--muted)">Hampir 10 tahun pengalaman · 300+ unit rumah terjual.</p>
${REVIEWS ? `<a href="${REVIEWS.profile_url}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;color:var(--cream);text-decoration:none;font-size:14px"><b style="font:800 18px var(--head)">${REVIEWS.rating}</b><span style="color:var(--accent);letter-spacing:1px">★★★★★</span><span style="color:var(--muted-2)">${REVIEWS.count} ulasan Google</span></a>` : ""}
<a class="btn btn-accent" href="${waLink(askText)}" target="_blank" rel="noopener">${sold ? "Cari rumah serupa" : "Tanya tentang rumah ini"}</a>
<a class="btn btn-ghost" href="tel:+60196071970">Telefon +6019-607 1970</a>
<small>${sold ? "Nak jual rumah anda di kawasan ini? WhatsApp Zack." : "Mesej WhatsApp sudah ada nama rumah dan ID listing."}</small>
</aside>
</div>
${similar.length ? `<section class="section"><h2 style="font-size:26px;font-weight:800">Rumah lain dijual berdekatan</h2><div class="cards">${similar.map(card).join("")}</div></section>` : ""}
</main>`;

  const script = pics.length > 1
    ? `<script>document.querySelectorAll('.thumbs button').forEach(function(b){b.addEventListener('click',function(){var m=document.getElementById('main-img'),c=document.getElementById('main-cap');m.src=b.getAttribute('data-src');m.alt=b.getAttribute('data-alt');c.textContent=b.getAttribute('data-cap');c.hidden=!b.getAttribute('data-cap');document.querySelectorAll('.thumbs button').forEach(function(x){x.setAttribute('aria-current',String(x===b));});});});</script>`
    : "";

  return page({
    title: sold ? `${title} – Terjual | Zack Ahmad, REN 36121` : `${l.jenis} Untuk Dijual, ${l.taman} ${l.kawasan}${harga ? " – RM " + harga : ""} | Zack Ahmad`,
    desc, canonical: p, image: pics[0], jsonld, body, script,
  });
}

/* ---------------- list pages ---------------- */
function listPage({ canonical, title, h1, intro, items, crumbs, extra = "", noindex = false, emptyText }) {
  const body = `<main class="wrap">
${crumbHtml(crumbs)}
<div style="display:flex;flex-direction:column;gap:12px;padding:12px 0 8px;max-width:760px">
<h1 style="font-weight:800;font-size:clamp(30px,4vw,46px)">${esc(h1)}</h1>
<p style="font-size:18px;color:var(--ink)">${esc(intro)}</p>
</div>
${items.length ? `<div class="cards" style="margin-top:20px">${items.map(card).join("")}</div>` : `<p class="empty" style="margin-top:20px">${emptyText}</p>`}
${extra}
</main>`;
  return page({
    title, desc: intro, canonical, noindex, body,
    jsonld: { "@context": "https://schema.org", "@graph": [crumbLd(crumbs), { "@type": "ItemList", itemListElement: items.map((l, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + listingPath(l), name: titleOf(l) })) }] },
  });
}

function areaChips(dijual) {
  const counts = new Map();
  for (const [k, n] of AREAS) counts.set(areaPath(k, n), { name: k, n: 0 });
  for (const l of dijual) {
    const key = areaPath(l.kawasan, l.negeri);
    if (!counts.has(key)) counts.set(key, { name: l.kawasan, n: 0 });
    counts.get(key).n++;
  }
  return `<section class="section"><h2 style="font-size:24px;font-weight:800">Cari mengikut kawasan</h2><div class="chips">${[...counts.entries()]
    .map(([href, v]) => `<a class="chip" href="${href}">${esc(v.name)}${v.n ? ` · ${v.n}` : ""}</a>`).join("")}</div></section>`;
}

/* ---------------- area guide page ---------------- */
function guidePage(g, href, d, t) {
  const crumbs = [["Utama", "/"], ["Rumah Dijual", "/rumah-dijual/"], [g.negeri, "/rumah-dijual/"], [g.kawasan, href]];
  const ul = (xs) => `<ul class="near">${(xs || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const band = (inner, cls = "") => `<section class="band ${cls}"><div class="wrap band-in">${inner}</div></section>`;
  const eb = (x) => `<span class="eyebrow">${x}</span>`;
  const h2 = (x) => `<h2 class="g-h2">${x}</h2>`;
  const para = (xs) => (xs || []).map((x) => `<p class="g-p">${esc(x)}</p>`).join("");
  const updated = g.dikemaskini ? fmtDate(g.dikemaskini) : "";
  const sellWa = waLink(`Salam Zack, saya nak jual rumah di ${g.kawasan}. Boleh bantu kaji harga?`);
  const askWa = waLink(`Salam Zack, saya nak tahu harga munasabah untuk rumah saya di ${g.kawasan}. Taman: `);

  const hero = `<section class="band dark"><div class="wrap g-hero">
<div class="g-hero-text">
${crumbHtml(crumbs).replace('class="crumb"', 'class="crumb" style="color:var(--muted-2)"').replace(/<a /g, '<a style="color:var(--muted-2)" ')}
<span class="eyebrow" style="color:var(--accent)">${esc(g.eyebrow || "Panduan kawasan")}</span>
<h1 class="g-h1">${esc(g.h1 || `Rumah untuk dijual di ${g.kawasan}`)}</h1>
<p style="font-size:18px;line-height:1.7;color:var(--muted)">${esc(g.ringkasan)}</p>
<div class="row-btns"><a class="btn btn-accent" href="${sellWa}" target="_blank" rel="noopener">${esc(g.cta_utama || "WhatsApp Zack")}</a><a class="btn btn-ghost" href="#senarai">Lihat rumah dijual</a></div>
<div class="chips">${(g.sorotan || []).map((x) => `<span class="chip" style="background:transparent;color:var(--cream);border-color:var(--line)">${esc(x)}</span>`).join("")}</div>
<span class="meta" style="color:var(--muted-2)">${updated ? `Dikemas kini <time datetime="${esc(g.dikemaskini)}">${updated}</time> · ` : ""}Oleh <a href="/" style="color:var(--muted-2)">Zack Ahmad</a>, REN 36121</span>
</div>
<div class="g-photo"><img src="/img/zack-ahmad.jpg" alt="Zack Ahmad, perunding hartanah berdaftar ${esc(g.kawasan)}" width="360" height="450" fetchpriority="high"></div>
</div></section>`;

  const m = g.matlamat;
  const matlamat = m ? band(eb("Matlamat") + h2(esc(m.tajuk)) + para(m.perenggan)) : "";

  const jh = g.jenis_hartanah;
  const jenisH = jh ? band(eb("Jenis hartanah") + h2(esc(jh.tajuk)) + (jh.pengenalan ? `<p class="g-p">${esc(jh.pengenalan)}</p>` : "") +
    `<div class="g-cards">${jh.senarai.map(([a, b]) => `<div class="g-card"><h3>${esc(a)}</h3><p>${esc(b)}</p></div>`).join("")}</div>`, "white") : "";

  const k = g.kajian_harga;
  const kajian = k ? band(eb("Langkah pertama") + h2(esc(k.tajuk)) + `<p class="g-p">${esc(k.pengenalan)}</p>` +
    `<div class="g-cards">${k.perkara.map(([a, b]) => `<div class="g-card"><h3>${esc(a)}</h3><p>${esc(b)}</p></div>`).join("")}</div>` +
    `<p class="g-p" style="color:var(--navy);font-weight:600">${esc(k.penutup)}</p>`, "tight") : "";

  const hk = g.harga_kompetitif;
  const kompetitif = hk ? band(`<span class="eyebrow" style="color:var(--accent)">Strategi harga</span>` + `<h2 class="g-h2" style="color:var(--cream)">${esc(hk.tajuk)}</h2>` +
    `<p class="g-p" style="color:var(--muted)">${esc(hk.pengenalan)}</p>` +
    `<div class="g-reasons">${hk.sebab.map(([a, b], i) => `<div><b>0${i + 1}</b><h3>${esc(a)}</h3><p>${esc(b)}</p></div>`).join("")}</div>`, "dark") : "";

  const kj = g.kerja;
  const kerja = kj ? band(eb("Servis lengkap") + h2(esc(kj.tajuk)) +
    `<ol class="g-work">${kj.senarai.map(([a, b], i) => `<li><b>${String(i + 1).padStart(2, "0")}</b><div><strong>${esc(a)}</strong><span>${esc(b)}</span></div></li>`).join("")}</ol>`) : "";

  const cta = band(`<div class="box g-cta"><div><h2 style="font-size:28px;font-weight:800">Nak tahu harga munasabah untuk rumah anda di ${esc(g.kawasan)}?</h2><p class="meta" style="font-size:16px">WhatsApp saya nama taman dan jenis rumah. Saya akan kongsi gambaran nilai bank dan harga pasaran semasa.</p></div><a class="btn btn-navy" href="${askWa}" target="_blank" rel="noopener">WhatsApp Zack</a></div>`, "tight");

  const proses = g.proses ? band(eb("Proses") + h2("Proses jual rumah bersama saya") +
    `<ol class="g-steps">${g.proses.map(([a, b], i) => `<li><b>0${i + 1}</b><strong>${esc(a)}</strong><span>${esc(b)}</span></li>`).join("")}</ol>`, "white") : "";

  const listings = `<section class="band" id="senarai"><div class="wrap band-in">${eb("Senarai semasa")}${h2(`Rumah dijual di ${esc(g.kawasan)}`)}
${d.length ? `<div class="cards">${d.map(card).join("")}</div>` : `<p class="empty">Tiada listing aktif di ${esc(g.kawasan)} buat masa ini. <a href="${waLink(`Salam Zack, saya cari rumah di ${g.kawasan}.`)}">WhatsApp Zack, saya bantu carikan →</a></p>`}
${t.length ? `<h3 style="font:800 22px var(--head);margin-top:12px">Rekod jualan di ${esc(g.kawasan)}</h3><div class="cards">${t.slice(0, 6).map(card).join("")}</div>` : ""}
${g.pembeli ? `<div class="nota" style="margin-top:8px"><div><h2>Untuk pembeli</h2><p>${esc(g.pembeli)}</p></div></div>` : ""}
</div></section>`;

  const harga = (g.harga || g.nota_zack) ? band(
    (g.harga ? `<div class="box"><h2 style="font-size:24px">Gambaran harga pasaran di ${esc(g.kawasan)}</h2><p>${esc(g.harga.teks)}</p>${g.harga.sumber_url ? `<span class="meta">Sumber: <a href="${esc(g.harga.sumber_url)}" rel="nofollow noopener" target="_blank">${esc(g.harga.sumber_nama)}</a></span>` : ""}</div>` : "") +
    (g.nota_zack ? `<div class="nota"><img src="/img/zack-ahmad.jpg" alt="Zack Ahmad" width="56" height="56"><div><h2>Nota Zack tentang ${esc(g.kawasan)}</h2><p>${esc(g.nota_zack)}</p><span>Zack Ahmad · Perunding Hartanah Berdaftar REN 36121</span></div></div>` : ""), "tight") : "";

  const tg = g.tentang || { tajuk: `Tentang ${g.kawasan}`, perenggan: g.pengenalan || [] };
  const tentang = band(eb("Kawasan") + h2(esc(tg.tajuk)) + para(tg.perenggan) +
    (g.taman && g.taman.length ? `<div class="chips">${g.taman.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : "") +
    `<div class="g-cols">${[["Pengangkutan", g.pengangkutan], ["Sekolah &amp; universiti", g.pendidikan], ["Kemudahan", g.kemudahan]]
      .filter(([, xs]) => xs && xs.length).map(([h, xs]) => `<div><h3>${h}</h3>${ul(xs)}</div>`).join("")}</div>`, "white");

  const faq = g.faq && g.faq.length ? band(eb("Soalan lazim") + h2(`Soalan pemilik rumah di ${esc(g.kawasan)}`) +
    `<div class="faq" style="max-width:900px">${g.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>` +
    (g.sumber && g.sumber.length ? `<div style="font-size:13px;color:var(--ink)"><strong>Sumber maklumat kawasan</strong><ul style="margin:6px 0 0;padding-left:18px;line-height:1.8">${g.sumber.map(([n, u]) => `<li><a href="${esc(u)}" rel="nofollow noopener" target="_blank">${esc(n)}</a></li>`).join("")}</ul></div>` : "")) : "";

  const body = hero + matlamat + jenisH + kajian + kompetitif + kerja + cta + proses + listings + harga + tentang + faq;

  const jsonld = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", name: g.h1 || `Rumah untuk dijual di ${g.kawasan}`, url: SITE + href, description: g.ringkasan, dateModified: g.dikemaskini, inLanguage: "ms-MY",
      about: { "@type": "Place", name: g.kawasan, address: { "@type": "PostalAddress", addressLocality: g.kawasan, addressRegion: g.negeri, addressCountry: "MY" } },
      author: { "@id": SITE + "/#zack" }, mainEntity: { "@id": SITE + "/#zack" } },
    { "@type": "RealEstateAgent", "@id": SITE + "/#zack", name: "Zack Ahmad", telephone: "+60196071970", url: SITE + "/",
      areaServed: { "@type": "Place", name: `${g.kawasan}, ${g.daerah || g.negeri}` },
      hasOfferCatalog: kj ? { "@type": "OfferCatalog", name: `Servis jual rumah di ${g.kawasan}`, itemListElement: kj.senarai.map(([a, b]) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: a, description: b } })) } : undefined },
    crumbLd(crumbs),
    { "@type": "ItemList", itemListElement: d.map((l, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + listingPath(l), name: titleOf(l) })) },
    ...(g.faq && g.faq.length ? [{ "@type": "FAQPage", mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }] : []),
  ] };
  const desc = g.ringkasan.length > 158 ? g.ringkasan.slice(0, 155).replace(/\s+\S*$/, "") + "…" : g.ringkasan;
  return page({ title: g.tajuk_seo || `Rumah Untuk Dijual di ${g.kawasan} | Zack Ahmad`, desc, canonical: href, jsonld, body });
}

/* ---------------- articles (panduan) ---------------- */
const ARTICLES = [];
try {
  for (const f of await fs.readdir(path.join(ROOT, "data", "panduan"))) {
    if (!f.endsWith(".md")) continue;
    const raw = await fs.readFile(path.join(ROOT, "data", "panduan", f), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) continue;
    const meta = Object.fromEntries(m[1].split("\n").filter((l) => l.includes(": ")).map((l) => [l.slice(0, l.indexOf(": ")).trim(), l.slice(l.indexOf(": ") + 2).trim()]));
    ARTICLES.push({ ...meta, slug: meta.slug || f.replace(/\.md$/, ""), body: m[2].trim() });
  }
  ARTICLES.sort((a, b) => String(b.tarikh).localeCompare(String(a.tarikh)));
} catch { /* tiada artikel */ }

function mdInline(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
}
function mdToHtml(md) {
  const toc = [];
  const html = md.split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n");
    if (/^##\s/.test(lines[0])) {
      const t = lines[0].replace(/^##\s+/, "");
      const id = slugify(t);
      toc.push([t, id]);
      return `<h2 id="${id}">${mdInline(t)}</h2>`;
    }
    if (/^###\s/.test(lines[0])) return `<h3>${mdInline(lines[0].replace(/^###\s+/, ""))}</h3>`;
    if (lines.length > 1 && lines.every((l) => /^\s*\|/.test(l))) {
      const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const rows = lines.filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l)).map(cells);
      const [head, ...rest] = rows;
      return `<div class="tbl"><table><thead><tr>${head.map((c) => `<th scope="col">${mdInline(c)}</th>`).join("")}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${mdInline(c)}</th>` : `<td>${mdInline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    if (lines.every((l) => /^[*-]\s/.test(l))) return `<ul>${lines.map((l) => `<li>${mdInline(l.replace(/^[*-]\s+/, ""))}</li>`).join("")}</ul>`;
    if (lines.every((l) => /^\d+\.\s/.test(l))) return `<ol>${lines.map((l) => `<li>${mdInline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
    const text = lines.join(" ");
    const box = text.match(/^(Tip|Penting):\s*/i);
    if (box) return `<p class="tip"><strong>${box[1][0].toUpperCase() + box[1].slice(1).toLowerCase()}:</strong> ${mdInline(text.slice(box[0].length))}</p>`;
    return `<p>${mdInline(text)}</p>`;
  }).join("\n");
  return { html, toc };
}
const readMins = (md) => Math.max(1, Math.round(md.split(/\s+/).length / 200));
const articlePath = (a) => `/panduan/${a.slug}/`;

function articleCard(a) {
  return `<a class="card" href="${articlePath(a)}" style="padding:24px;gap:10px">
<span class="eyebrow">${esc(a.kategori || "Panduan")} · ${readMins(a.body)} minit bacaan</span>
<span style="font:800 20px/1.35 var(--head)">${esc(a.tajuk)}</span>
<span class="m" style="line-height:1.6">${esc(a.ringkasan)}</span>
<span style="color:var(--brass);font-weight:600">Baca artikel →</span></a>`;
}

function articlePage(a) {
  const { html, toc } = mdToHtml(a.body);
  const p = articlePath(a);
  const crumbs = [["Utama", "/"], ["Panduan", "/panduan/"], [a.tajuk, p]];
  const others = ARTICLES.filter((x) => x.slug !== a.slug).slice(0, 3);
  const guides = [...GUIDES.values()];
  const askWa = waLink(`Salam Zack, saya baca artikel "${a.tajuk}". Saya nak tanya tentang jual rumah.`);
  const body = `<main class="wrap art-wrap">
<article class="art">
${crumbHtml([["Utama", "/"], ["Panduan", "/panduan/"], [a.kategori || "Artikel", p]])}
<span class="eyebrow">Panduan ${esc((a.kategori || "").toLowerCase())}</span>
<h1 class="art-h1">${esc(a.tajuk)}</h1>
<div class="byline"><img src="/img/zack-ahmad.jpg" alt="Zack Ahmad" width="40" height="40"><span><a href="/"><strong>Zack Ahmad</strong></a> · Perunding Hartanah Berdaftar REN 36121<br><time datetime="${esc(a.tarikh)}">${fmtDate(a.tarikh)}</time>${a.kemaskini && a.kemaskini !== a.tarikh ? ` · Dikemas kini <time datetime="${esc(a.kemaskini)}">${fmtDate(a.kemaskini)}</time>` : ""} · ${readMins(a.body)} minit bacaan</span></div>
${toc.length > 2 ? `<nav class="toc" aria-label="Kandungan"><strong>Kandungan</strong><ol>${toc.map(([t, id]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join("")}</ol></nav>` : ""}
<div class="prose">${html}</div>
<div class="art-cta"><div><strong>Nak jual rumah dengan harga yang munasabah?</strong><span>Saya bantu kaji nilai bank dan harga pasaran, dan uruskan jualan sehingga serahan kunci.</span></div><a class="btn btn-accent" href="${askWa}" target="_blank" rel="noopener">WhatsApp Zack</a></div>
</article>
<aside class="art-side">
<div class="agent" style="position:static;max-width:none"><img src="/img/zack-ahmad.jpg" alt="Zack Ahmad" width="64" height="64"><strong style="font:800 19px var(--head)">Tentang penulis</strong>
<span style="font-size:14px;line-height:1.6;color:var(--muted)">Zack Ahmad, Perunding Hartanah Berdaftar REN 36121 di Legacy Real Property Sdn Bhd. Hampir 10 tahun pengalaman, 300+ unit rumah terjual.</span>
${REVIEWS ? `<a href="${REVIEWS.profile_url}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;font-size:14px">${REVIEWS.rating} ★★★★★ · ${REVIEWS.count} ulasan Google</a>` : ""}</div>
<div class="box" style="gap:8px;font-size:15px"><strong style="font:800 16px var(--head)">Baca juga</strong>
${guides.map((g) => `<a href="${areaPath(g.kawasan, g.negeri)}">Ejen hartanah ${esc(g.kawasan)} →</a>`).join("")}
${others.map((x) => `<a href="${articlePath(x)}">${esc(x.tajuk)} →</a>`).join("")}
<a href="/rumah-dijual/">Semua rumah dijual →</a></div>
</aside>
</main>`;
  const jsonld = { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", headline: a.tajuk, description: a.ringkasan, url: SITE + p, mainEntityOfPage: SITE + p, inLanguage: "ms-MY",
      datePublished: a.tarikh, dateModified: a.kemaskini || a.tarikh, image: SITE + "/img/zack-ahmad.jpg",
      author: { "@type": "Person", name: "Zack Ahmad", jobTitle: "Perunding Hartanah Berdaftar (REN 36121)", url: SITE + "/", worksFor: { "@type": "Organization", name: "Legacy Real Property Sdn Bhd" } },
      publisher: { "@id": SITE + "/#zack" }, articleSection: a.kategori, wordCount: a.body.split(/\s+/).length },
    crumbLd(crumbs),
  ] };
  return page({ title: a.tajuk_seo || `${a.tajuk} | Zack Ahmad`, desc: a.ringkasan.length > 158 ? a.ringkasan.slice(0, 155).replace(/\s+\S*$/, "") + "…" : a.ringkasan, canonical: p, jsonld, body });
}

function articlesIndex() {
  const crumbs = [["Utama", "/"], ["Panduan", "/panduan/"]];
  const body = `<main class="wrap">
${crumbHtml(crumbs)}
<div style="display:flex;flex-direction:column;gap:12px;padding:12px 0 8px;max-width:760px">
<h1 style="font-weight:800;font-size:clamp(30px,4vw,46px)">Panduan hartanah</h1>
<p style="font-size:18px;color:var(--ink)">Tip dan panduan jual beli rumah oleh Zack Ahmad, Perunding Hartanah Berdaftar REN 36121.</p>
</div>
<div class="cards" style="margin-top:20px">${ARTICLES.map(articleCard).join("")}</div>
</main>`;
  return page({ title: "Panduan Hartanah – Tip Jual & Beli Rumah | Zack Ahmad, REN 36121", desc: "Tip dan panduan jual beli rumah oleh Zack Ahmad, Perunding Hartanah Berdaftar REN 36121.", canonical: "/panduan/", body,
    jsonld: { "@context": "https://schema.org", "@graph": [crumbLd(crumbs), { "@type": "ItemList", itemListElement: ARTICLES.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + articlePath(a), name: a.tajuk })) }] } });
}

/* ---------------- homepage prerender ---------------- */
function homeCard(l) {
  const title = titleOf(l);
  const sold = l.status === "terjual";
  const ph = photos(l)[0];
  const img = `<div class="img">${ph ? `<img src="${esc(ph)}" alt="${esc(title)}" loading="lazy">` : "Gambar akan dikemas kini"}<span class="tag${sold ? " sold" : ""}">${sold ? "TERJUAL" : "DIJUAL"}</span></div>`;
  if (sold) {
    return `<article class="listing">${img}<div class="body"><h3><a href="${listingPath(l)}" style="color:inherit;text-decoration:none">${esc(title)}</a></h3><span class="note">${esc(soldWhen(l))}</span><a href="${areaPath(l.kawasan, l.negeri)}">Cari rumah serupa di ${esc(l.kawasan)} →</a></div></article>`;
  }
  const specs = [l.bilik != null ? l.bilik + " bilik" : "", l.bilik_air != null ? l.bilik_air + " bilik air" : "", l.keluasan_kps != null ? num(l.keluasan_kps) + " kps" : "", l.pegangan || ""].filter(Boolean);
  return `<article class="listing" id="hartanah-${l.id}">${img}<div class="body"><span class="price">${num(l.harga) ? "RM " + num(l.harga) : "Harga: hubungi"}</span><h3><a href="${listingPath(l)}" style="color:inherit;text-decoration:none">${esc(title)}</a></h3><div class="specs">${specs.map((x) => `<span>${esc(x)}</span>`).join("")}</div><a href="${listingPath(l)}">Lihat butiran →</a></div></article>`;
}

/* ---------------- build ---------------- */
async function main() {
  const all = await loadListings();
  const dijual = all.filter((l) => l.status === "dijual");
  const terjual = all.filter((l) => l.status === "terjual").sort((a, b) => String(b.tarikh_terjual || "").localeCompare(String(a.tarikh_terjual || "")));

  await fs.rm(OUT, { recursive: true, force: true });
  await copyDir(ROOT, OUT);

  const urls = [{ loc: "/", pri: "1.0" }, { loc: "/rumah-dijual/", pri: "0.9" }, { loc: "/terjual/", pri: "0.6" }];
  // IndexNow: listing yang berubah dalam 3 jam lepas (bina setiap jam), atau semua URL bila INDEXNOW_ALL=1
  const recent = Date.now() - 3 * 60 * 60 * 1000;
  const changed = { listings: all.filter((l) => new Date(l.updated_at || 0).getTime() > recent), areas: new Set() };

  for (const l of all) {
    await write(path.join(listingPath(l), "index.html"), listingPage(l, all));
    urls.push({ loc: listingPath(l), lastmod: (l.updated_at || "").slice(0, 10), pri: l.status === "dijual" ? "0.8" : "0.5" });
  }

  await write("rumah-dijual/index.html", listPage({
    canonical: "/rumah-dijual/", title: "Rumah Untuk Dijual di Lembah Klang & Semenanjung | Zack Ahmad, REN 36121",
    h1: "Rumah untuk dijual", intro: `Senarai terkini ${dijual.length} rumah untuk dijual oleh Zack Ahmad, Perunding Hartanah Berdaftar REN 36121, di Lembah Klang dan Semenanjung Malaysia.`,
    items: dijual, crumbs: [["Utama", "/"], ["Rumah Dijual", "/rumah-dijual/"]], extra: areaChips(dijual),
    emptyText: `Senarai terkini sedang dikemas kini. <a href="${waLink("Salam Zack, boleh kongsi senarai rumah dijual terkini?")}">WhatsApp Zack untuk senarai terkini →</a>`,
  }));
  await write("terjual/index.html", listPage({
    canonical: "/terjual/", title: "Rekod Jualan – Rumah Terjual | Zack Ahmad, REN 36121",
    h1: "Rekod jualan", intro: "Antara rumah yang telah dijual oleh Zack Ahmad, Perunding Hartanah Berdaftar REN 36121. Lebih 300 unit terjual dalam hampir 10 tahun.",
    items: terjual, crumbs: [["Utama", "/"], ["Rekod Jualan", "/terjual/"]],
    emptyText: "Rekod jualan akan dikemas kini.", noindex: terjual.length === 0,
  }));

  // Halaman kawasan
  const areas = new Map();
  for (const [k, n] of AREAS) areas.set(areaPath(k, n), { kawasan: k, negeri: n });
  for (const l of all) if (l.kawasan) { const key = areaPath(l.kawasan, l.negeri); if (!areas.has(key)) areas.set(key, { kawasan: l.kawasan, negeri: l.negeri || "Selangor" }); }
  for (const g of GUIDES.values()) { const key = areaPath(g.kawasan, g.negeri); if (!areas.has(key)) areas.set(key, { kawasan: g.kawasan, negeri: g.negeri || "Selangor" }); }
  const KW = await loadKawasan();
  const kwBySlug = new Map(KW.map((r) => [slugify(r.nama), r]));
  for (const r of KW) { const key = areaPath(r.nama, r.negeri); if (!areas.has(key)) areas.set(key, { kawasan: r.nama, negeri: r.negeri || "Selangor", tarikh: r.dicipta }); }
  for (const [href, a] of areas) {
    const inArea = (l) => slugify(l.kawasan) === slugify(a.kawasan) && slugify(l.negeri || "Selangor") === slugify(a.negeri);
    const d = dijual.filter(inArea), t = terjual.filter(inArea);
    const kw = kwBySlug.get(slugify(a.kawasan));
    let guide = GUIDES.get(slugify(a.kawasan)) || autoGuide(a.kawasan, a.negeri, a.tarikh || (kw && kw.dicipta));
    if (kw && String(kw.nota_zack || "").trim()) {
      guide = { ...guide, nota_zack: kw.nota_zack.trim() };
      if (kw.dikemaskini && String(kw.dikemaskini).slice(0, 10) > String(guide.dikemaskini || "")) guide.dikemaskini = String(kw.dikemaskini).slice(0, 10);
    }
    if (guide) {
      await write(path.join(href, "index.html"), guidePage(guide, href, d, t));
      urls.push({ loc: href, lastmod: guide.dikemaskini, pri: "0.8" });
      changed.areas.add(href);
      continue;
    }
    const soldBlock = t.length ? `<section class="section"><h2 style="font-size:26px;font-weight:800">Rekod jualan di ${esc(a.kawasan)}</h2><div class="cards">${t.slice(0, 6).map(card).join("")}</div></section>` : "";
    await write(path.join(href, "index.html"), listPage({
      canonical: href, title: `Rumah Untuk Dijual di ${a.kawasan}, ${a.negeri} | Zack Ahmad, REN 36121`,
      h1: `Rumah untuk dijual di ${a.kawasan}`,
      intro: `Senarai rumah untuk dijual di ${a.kawasan}, ${a.negeri} oleh Zack Ahmad, Perunding Hartanah Berdaftar REN 36121 dengan hampir 10 tahun pengalaman.`,
      items: d, crumbs: [["Utama", "/"], ["Rumah Dijual", "/rumah-dijual/"], [a.negeri, "/rumah-dijual/"], [a.kawasan, href]],
      extra: soldBlock, noindex: d.length === 0 && t.length === 0,
      emptyText: `Tiada listing aktif di ${esc(a.kawasan)} buat masa ini. <a href="${waLink(`Salam Zack, saya cari rumah di ${a.kawasan}.`)}">WhatsApp Zack, saya bantu carikan →</a>`,
    }));
    if (d.length || t.length) urls.push({ loc: href, pri: "0.7" });
  }

  // Panduan (artikel)
  if (ARTICLES.length) {
    await write("panduan/index.html", articlesIndex());
    urls.push({ loc: "/panduan/", pri: "0.7" });
    for (const a of ARTICLES) {
      await write(path.join(articlePath(a), "index.html"), articlePage(a));
      urls.push({ loc: articlePath(a), lastmod: a.kemaskini || a.tarikh, pri: "0.7" });
      // Pautan lama (slug_lama: a, b) -> redirect ke pautan baru
      for (const old of String(a.slug_lama || "").split(",").map((x) => x.trim()).filter(Boolean)) {
        const to = `${SITE}${articlePath(a)}`;
        await write(path.join("panduan", old, "index.html"), `<!doctype html><html lang="ms"><head><meta charset="utf-8"><title>${esc(a.tajuk)}</title><link rel="canonical" href="${to}"><meta name="robots" content="noindex,follow"><meta http-equiv="refresh" content="0; url=${articlePath(a)}"><script>location.replace(${JSON.stringify(articlePath(a))}+location.hash)</script></head><body><p>Artikel ini telah dipindahkan ke <a href="${articlePath(a)}">${esc(a.tajuk)}</a>.</p></body></html>`);
      }
    }
  }

  // Senarai URL untuk IndexNow (dibaca oleh scripts/indexnow.mjs selepas deploy)
  let notify;
  if (process.env.INDEXNOW_ALL === "1") notify = urls.map((u) => SITE + u.loc);
  else {
    const set = new Set();
    for (const l of changed.listings) { set.add(SITE + listingPath(l)); set.add(SITE + areaPath(l.kawasan, l.negeri)); }
    if (set.size) { set.add(SITE + "/"); set.add(SITE + "/rumah-dijual/"); set.add(SITE + "/terjual/"); }
    notify = [...set];
  }
  await fs.writeFile(path.join(ROOT, "indexnow-urls.json"), JSON.stringify(notify, null, 2));

  // 404
  await write("404.html", page({ title: "Halaman tidak dijumpai | Zack Ahmad", desc: "Halaman tidak dijumpai.", canonical: "/404.html", noindex: true,
    body: `<main class="wrap" style="padding-top:64px"><h1 id="nf-h" style="font-size:40px;font-weight:800">Halaman tidak dijumpai</h1><p id="nf-p" style="margin-top:12px;color:var(--ink)">Listing ini mungkin sudah dikeluarkan. <a href="/rumah-dijual/">Lihat rumah yang masih dijual →</a></p></main>
<script>
// Listing baru diterbitkan tetapi halamannya belum siap dijana: semak Supabase, papar maklumat ringkas & muat semula automatik.
(function () {
  var seg = location.pathname.split("/").filter(Boolean), m = seg[0] === "hartanah" && seg.length === 2 && seg[1].match(/-([0-9]+)$/);
  if (!m) return;
  fetch(${JSON.stringify(SB_URL)} + "/rest/v1/listings?select=id,jenis,taman,kawasan,harga,status&status=neq.draf&id=eq." + m[1], { headers: { apikey: ${JSON.stringify(SB_KEY)} } })
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      var l = rows && rows[0]; if (!l) return;
      var t = [l.jenis, l.taman].filter(Boolean).join(" di ") + (l.kawasan ? ", " + l.kawasan : "");
      var esc = function (x) { return String(x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
      document.title = t + " | Zack Ahmad";
      document.getElementById("nf-h").textContent = t;
      var wa = "https://wa.me/${WA}?text=" + encodeURIComponent("Salam Zack, saya berminat dengan " + t + " (ID #" + l.id + ").");
      document.getElementById("nf-p").innerHTML = (l.harga ? "<strong style='font-size:22px'>RM " + Number(l.harga).toLocaleString("en-MY") + "</strong><br>" : "") +
        "Listing ini baru diterbitkan dan halamannya sedang disediakan. Halaman ini akan dimuat semula secara automatik dalam beberapa saat." +
        "<br><br><a class='btn btn-navy' href='" + esc(wa) + "' target='_blank' rel='noopener'>WhatsApp Zack sekarang</a> &nbsp; <a href='/#hartanah-" + l.id + "'>Lihat di laman utama →</a>";
      var n = +(sessionStorage.getItem("nf-" + l.id) || 0);
      if (n < 12) { sessionStorage.setItem("nf-" + l.id, n + 1); setTimeout(function () { location.reload(); }, 20000); }
    }).catch(function () {});
})();
</script>` }));

  // Laman utama: pra-isi kad listing supaya Google nampak tanpa JavaScript
  const homeFile = path.join(OUT, "index.html");
  let home = await fs.readFile(homeFile, "utf8");
  home = home.replace('<div class="row cards" id="listings"></div>', `<div class="row cards" id="listings">${dijual.slice(0, 6).map(homeCard).join("")}</div>`);
  home = home.replace('<div class="row cards" id="sold"></div>', `<div class="row cards" id="sold"${terjual.length ? "" : " hidden"}>${terjual.slice(0, 6).map(homeCard).join("")}</div>`);
  home = home.replace('<div class="row cards" id="panduan-list"><!-- diisi semasa bina laman dari data/panduan/ --></div>',
    `<div class="row cards" id="panduan-list">${ARTICLES.slice(0, 3).map((a) => `<a class="guide" href="${articlePath(a)}"><small>${esc(a.kategori || "Panduan")} · ${readMins(a.body)} minit bacaan</small><strong>${esc(a.tajuk)}</strong><span>${esc(a.ringkasan)}</span><em>Baca artikel →</em></a>`).join("")}</div>`);
  await fs.writeFile(homeFile, home);

  // llms.txt: tambah senarai listing terkini
  const llmsFile = path.join(OUT, "llms.txt");
  try {
    let llms = await fs.readFile(llmsFile, "utf8");
    const lines = dijual.map((l) => `- [${titleOf(l)}](${SITE}${listingPath(l)}): ${num(l.harga) ? "RM " + num(l.harga) + ", " : ""}${[l.bilik != null ? l.bilik + " bilik" : "", l.keluasan_kps != null ? num(l.keluasan_kps) + " kps" : "", l.pegangan].filter(Boolean).join(", ")}`);
    const block = `\n## Rumah untuk dijual (dikemas kini ${new Date().toISOString().slice(0, 10)})\n\n${lines.length ? lines.join("\n") : "- Tiada listing aktif buat masa ini."}\n- [Semua rumah dijual](${SITE}/rumah-dijual/)\n${[...GUIDES.values()].map((g) => `- [Panduan kawasan: ${g.kawasan}](${SITE}${areaPath(g.kawasan, g.negeri)})\n`).join("")}- [Rekod jualan](${SITE}/terjual/)\n${ARTICLES.map((a) => `- [Panduan: ${a.tajuk}](${SITE}${articlePath(a)}): ${a.ringkasan}\n`).join("")}`;
    llms = llms.replace(/\n## Optional/, block + "\n## Optional");
    await fs.writeFile(llmsFile, llms);
  } catch { /* tiada llms.txt */ }

  // sitemap.xml
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${SITE}${u.loc}</loc><lastmod>${u.lastmod || today}</lastmod><priority>${u.pri}</priority></url>`).join("\n")}\n</urlset>\n`;
  await write("sitemap.xml", sitemap);

  console.log(`Siap: ${all.length} listing (${dijual.length} dijual, ${terjual.length} terjual), ${areas.size} halaman kawasan, ${urls.length} URL dalam sitemap.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
