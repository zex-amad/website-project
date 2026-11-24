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
try {
  for (const f of await fs.readdir(path.join(ROOT, "data", "kawasan"))) {
    if (!f.endsWith(".json")) continue;
    const g = JSON.parse(await fs.readFile(path.join(ROOT, "data", "kawasan", f), "utf8"));
    GUIDES.set(slugify(g.kawasan), g);
  }
} catch { /* tiada panduan */ }
export const INDEXNOW_KEY = "d79b637a3c99c35e28393fa9726a879a";
try { REVIEWS = JSON.parse(await fs.readFile(path.join(ROOT, "data", "reviews.json"), "utf8")); } catch { /* tiada ulasan */ }
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
<div class="links"><a href="/">Utama</a><a href="/rumah-dijual/">Rumah Dijual</a><a href="/terjual/">Rekod Jualan</a><a href="/#hubungi">Hubungi</a>
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
  const block = (title, inner) => `<section class="section"><h2 style="font-size:26px;font-weight:800">${title}</h2>${inner}</section>`;
  const updated = g.dikemaskini ? fmtDate(g.dikemaskini) : "";
  const body = `<section style="background:var(--navy);color:var(--cream)"><div class="wrap" style="padding-bottom:48px">
${crumbHtml(crumbs).replace('class="crumb"', 'class="crumb" style="color:var(--muted-2)"').replace(/<a /g, '<a style="color:var(--muted-2)" ')}
<div style="display:flex;flex-direction:column;gap:16px;max-width:820px;padding-top:12px">
<span class="eyebrow" style="color:var(--accent)">Panduan kawasan · Daerah ${esc(g.daerah || "")}</span>
<h1 style="font-weight:800;font-size:clamp(34px,5vw,58px)">Rumah untuk dijual di ${esc(g.kawasan)}</h1>
<p style="font-size:18px;line-height:1.7;color:var(--muted)">${esc(g.ringkasan)}</p>
<div class="chips">${(g.sorotan || []).map((x) => `<span class="chip" style="background:transparent;color:var(--cream);border-color:var(--line)">${esc(x)}</span>`).join("")}</div>
<span class="meta" style="color:var(--muted-2)">${updated ? `Dikemas kini <time datetime="${esc(g.dikemaskini)}">${updated}</time> · ` : ""}Oleh <a href="/" style="color:var(--muted-2)">Zack Ahmad</a>, REN 36121</span>
</div></div></section>
<main class="wrap">
${block(`Rumah dijual di ${esc(g.kawasan)}`, d.length ? `<div class="cards">${d.map(card).join("")}</div>` : `<p class="empty">Tiada listing aktif di ${esc(g.kawasan)} buat masa ini. <a href="${waLink(`Salam Zack, saya cari rumah di ${g.kawasan}.`)}">WhatsApp Zack, saya bantu carikan →</a></p>`)}
${block(`Kenapa ${esc(g.kawasan)}`, (g.pengenalan || []).map((p) => `<p style="font-size:17px;line-height:1.75;color:var(--ink);max-width:820px">${esc(p)}</p>`).join(""))}
${g.taman && g.taman.length ? block("Taman &amp; kawasan perumahan popular", `<div class="chips">${g.taman.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>`) : ""}
<div style="display:flex;flex-wrap:wrap;gap:0 40px">
${g.pengangkutan && g.pengangkutan.length ? `<div style="flex:1 1 340px">${block("Pengangkutan", ul(g.pengangkutan))}</div>` : ""}
${g.pendidikan && g.pendidikan.length ? `<div style="flex:1 1 340px">${block("Sekolah &amp; universiti", ul(g.pendidikan))}</div>` : ""}
</div>
${g.kemudahan && g.kemudahan.length ? block("Kemudahan &amp; tarikan berdekatan", ul(g.kemudahan)) : ""}
${g.harga ? `<section class="section"><div class="box"><h2 style="font-size:24px">Harga pasaran rumah di ${esc(g.kawasan)}</h2><p>${esc(g.harga.teks)}</p>${g.harga.sumber_url ? `<span class="meta">Sumber: <a href="${esc(g.harga.sumber_url)}" rel="nofollow noopener" target="_blank">${esc(g.harga.sumber_nama)}</a></span>` : ""}</div></section>` : ""}
${g.nota_zack ? `<section class="section"><div class="nota"><img src="/img/zack-ahmad.jpg" alt="Zack Ahmad" width="56" height="56"><div><h2>Nota Zack tentang ${esc(g.kawasan)}</h2><p>${esc(g.nota_zack)}</p><span>Zack Ahmad · Perunding Hartanah Berdaftar REN 36121</span></div></div></section>` : ""}
${g.faq && g.faq.length ? `<section class="section faq"><h2 style="font-size:26px;font-weight:800">Soalan lazim tentang ${esc(g.kawasan)}</h2><div>${g.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div></section>` : ""}
${t.length ? block(`Rekod jualan di ${esc(g.kawasan)}`, `<div class="cards">${t.slice(0, 6).map(card).join("")}</div>`) : ""}
<section class="section" style="gap:10px"><div class="box" style="flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between"><div><h2 style="font-size:22px">Nak beli atau jual rumah di ${esc(g.kawasan)}?</h2><p class="meta" style="font-size:15px">Zack Ahmad · Perunding Hartanah Berdaftar REN 36121 · hampir 10 tahun pengalaman</p></div><a class="btn btn-navy" href="${waLink(`Salam Zack, saya nak tanya tentang rumah di ${g.kawasan}.`)}" target="_blank" rel="noopener">WhatsApp Zack</a></div></section>
${g.sumber && g.sumber.length ? `<section class="section" style="font-size:13px;color:var(--ink);gap:6px"><strong>Sumber</strong><ul style="margin:0;padding-left:18px;line-height:1.8">${g.sumber.map(([n, u]) => `<li><a href="${esc(u)}" rel="nofollow noopener" target="_blank">${esc(n)}</a></li>`).join("")}</ul></section>` : ""}
</main>`;
  const jsonld = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", name: `Rumah untuk dijual di ${g.kawasan}`, url: SITE + href, description: g.ringkasan, dateModified: g.dikemaskini, inLanguage: "ms-MY",
      about: { "@type": "Place", name: g.kawasan, address: { "@type": "PostalAddress", addressLocality: g.kawasan, addressRegion: g.negeri, addressCountry: "MY" } },
      author: { "@type": "RealEstateAgent", "@id": SITE + "/#zack", name: "Zack Ahmad" } },
    crumbLd(crumbs),
    { "@type": "ItemList", itemListElement: d.map((l, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + listingPath(l), name: titleOf(l) })) },
    ...(g.faq && g.faq.length ? [{ "@type": "FAQPage", mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }] : []),
  ] };
  return page({ title: g.tajuk_seo || `Rumah Untuk Dijual di ${g.kawasan} | Zack Ahmad`, desc: g.ringkasan.length > 158 ? g.ringkasan.slice(0, 155).replace(/\s+\S*$/, "") + "…" : g.ringkasan, canonical: href, jsonld, body });
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
  for (const [href, a] of areas) {
    const inArea = (l) => slugify(l.kawasan) === slugify(a.kawasan) && slugify(l.negeri || "Selangor") === slugify(a.negeri);
    const d = dijual.filter(inArea), t = terjual.filter(inArea);
    const guide = GUIDES.get(slugify(a.kawasan));
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
    body: `<main class="wrap" style="padding-top:64px"><h1 style="font-size:40px;font-weight:800">Halaman tidak dijumpai</h1><p style="margin-top:12px;color:var(--ink)">Listing ini mungkin sudah dikeluarkan. <a href="/rumah-dijual/">Lihat rumah yang masih dijual →</a></p></main>` }));

  // Laman utama: pra-isi kad listing supaya Google nampak tanpa JavaScript
  const homeFile = path.join(OUT, "index.html");
  let home = await fs.readFile(homeFile, "utf8");
  home = home.replace('<div class="row cards" id="listings"></div>', `<div class="row cards" id="listings">${dijual.slice(0, 6).map(homeCard).join("")}</div>`);
  home = home.replace('<div class="row cards" id="sold"></div>', `<div class="row cards" id="sold"${terjual.length ? "" : " hidden"}>${terjual.slice(0, 6).map(homeCard).join("")}</div>`);
  await fs.writeFile(homeFile, home);

  // llms.txt: tambah senarai listing terkini
  const llmsFile = path.join(OUT, "llms.txt");
  try {
    let llms = await fs.readFile(llmsFile, "utf8");
    const lines = dijual.map((l) => `- [${titleOf(l)}](${SITE}${listingPath(l)}): ${num(l.harga) ? "RM " + num(l.harga) + ", " : ""}${[l.bilik != null ? l.bilik + " bilik" : "", l.keluasan_kps != null ? num(l.keluasan_kps) + " kps" : "", l.pegangan].filter(Boolean).join(", ")}`);
    const block = `\n## Rumah untuk dijual (dikemas kini ${new Date().toISOString().slice(0, 10)})\n\n${lines.length ? lines.join("\n") : "- Tiada listing aktif buat masa ini."}\n- [Semua rumah dijual](${SITE}/rumah-dijual/)\n${[...GUIDES.values()].map((g) => `- [Panduan kawasan: ${g.kawasan}](${SITE}${areaPath(g.kawasan, g.negeri)})\n`).join("")}- [Rekod jualan](${SITE}/terjual/)\n`;
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
