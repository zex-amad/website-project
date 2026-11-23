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
const EXCLUDE = new Set([".git", ".github", "scripts", "supabase", "data", "_site", "node_modules", "README.md", "sitemap.xml"]);

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
try { REVIEWS = JSON.parse(await fs.readFile(path.join(ROOT, "data", "reviews.json"), "utf8")); } catch { /* tiada ulasan */ }
async function loadListings() {
  if (process.env.LISTINGS_JSON) return JSON.parse(await fs.readFile(process.env.LISTINGS_JSON, "utf8"));
  const fields = "id,slug,status,jenis,taman,kawasan,negeri,harga,bilik,bilik_air,keluasan_kps,pegangan,penerangan,gambar,urutan,tarikh_terjual,created_at,updated_at";
  const url = `${SB_URL}/rest/v1/listings?select=${fields}&status=in.(dijual,terjual)&order=urutan.asc,id.desc`;
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
  const desc = sold
    ? `${title} – ${soldWhen(l).toLowerCase()} oleh Zack Ahmad (REN 36121). ${specs.join(", ")}. Nak jual rumah di ${l.kawasan}? Hubungi +6019-607 1970.`
    : `${title} untuk dijual${harga ? " pada RM " + harga : ""}. ${specs.join(", ")}. Hubungi Zack Ahmad (REN 36121) di +6019-607 1970.`;
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
        image: pics.length ? pics : undefined,
        description: (l.penerangan || desc).slice(0, 500),
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
        },
      },
      crumbLd(crumbs),
    ],
  };

  const gallery = pics.length
    ? `<div class="gallery"><div class="main-ph"><img id="main-img" src="${esc(pics[0])}" alt="${esc(title)} – gambar 1" fetchpriority="high"><span class="tag${sold ? " sold" : ""}">${sold ? "TERJUAL" : "DIJUAL"}</span></div>
${pics.length > 1 ? `<div class="thumbs" role="list">${pics.map((u, i) => `<button type="button" role="listitem" data-src="${esc(u)}" aria-label="Gambar ${i + 1}" aria-current="${i === 0}"><img src="${esc(u)}" alt="${esc(title)} – gambar ${i + 1}" loading="lazy"></button>`).join("")}</div>` : ""}</div>`
    : `<div class="gallery"><div class="main-ph">Gambar akan dikemas kini<span class="tag${sold ? " sold" : ""}">${sold ? "TERJUAL" : "DIJUAL"}</span></div></div>`;

  const facts = [["Bilik", l.bilik], ["Bilik air", l.bilik_air], ["Keluasan", l.keluasan_kps != null ? num(l.keluasan_kps) + " kps" : null], ["Pegangan", l.pegangan]]
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `<div class="fact"><span>${k}</span><b>${esc(v)}</b></div>`).join("");

  const rows = [["Jenis", l.jenis], ["Taman / projek", l.taman], ["Kawasan", [l.kawasan, l.negeri].filter(Boolean).join(", ")],
    !sold && perKps ? ["Harga / kps", "RM " + perKps] : null, sold ? ["Status", soldWhen(l)] : null, ["ID listing", "#" + l.id]]
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
</div>
${facts ? `<div class="facts">${facts}</div>` : ""}
${l.penerangan ? `<section style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:22px">Penerangan</h2><p class="desc">${esc(l.penerangan.trim())}</p></section>` : ""}
<section style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:22px">Butiran</h2><table><tbody>${rows}</tbody></table></section>
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
    ? `<script>document.querySelectorAll('.thumbs button').forEach(function(b,i){b.addEventListener('click',function(){var m=document.getElementById('main-img');m.src=b.getAttribute('data-src');m.alt=m.alt.replace(/gambar \\d+$/,'gambar '+(i+1));document.querySelectorAll('.thumbs button').forEach(function(x){x.setAttribute('aria-current',String(x===b));});});});</script>`
    : "";

  return page({
    title: sold ? `${title} – Terjual | Zack Ahmad, REN 36121` : `${title}${harga ? " – RM " + harga : ""} | Zack Ahmad, REN 36121`,
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
  for (const [href, a] of areas) {
    const inArea = (l) => slugify(l.kawasan) === slugify(a.kawasan) && slugify(l.negeri || "Selangor") === slugify(a.negeri);
    const d = dijual.filter(inArea), t = terjual.filter(inArea);
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
    const block = `\n## Rumah untuk dijual (dikemas kini ${new Date().toISOString().slice(0, 10)})\n\n${lines.length ? lines.join("\n") : "- Tiada listing aktif buat masa ini."}\n- [Semua rumah dijual](${SITE}/rumah-dijual/)\n- [Rekod jualan](${SITE}/terjual/)\n`;
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
