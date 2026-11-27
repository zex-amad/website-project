// Penulis draf artikel /panduan secara automatik (Gemini API, peringkat percuma).
//
// Aliran: pilih SATU topik seterusnya dari data/kata-kunci/topik.json -> ambil data sebenar Zack dari Supabase
// -> minta Gemini tulis draf -> semak kualiti -> simpan data/panduan/{slug}.md.
// Workflow .github/workflows/tulis-panduan.yml kemudian buka Pull Request untuk Zack semak & tambah "Nota Zack".
// Artikel yang masih ada penanda [[ZACK: ...]] TIDAK diterbitkan oleh build-site.mjs.
//
// Pemboleh ubah persekitaran:
//   GEMINI_API_KEY   kunci dari Google AI Studio (GitHub Secret). Wajib kecuali GEMINI_MOCK.
//   GEMINI_MODEL     pilihan, cth. gemini-flash-latest (lalai).
//   TOPIK            pilihan, paksa slug topik tertentu.
//   SKIP_SLUGS       pilihan, slug dipisah koma (draf yang Zack tolak).
//   LISTINGS_JSON    pilihan, fail data contoh (ujian tanpa Supabase).
//   GEMINI_MOCK      pilihan, fail JSON jawapan palsu (ujian tanpa API).
//   PR_BODY          pilihan, laluan fail untuk teks Pull Request.
//
// Uji: LISTINGS_JSON=contoh.json GEMINI_MOCK=jawapan.json node scripts/tulis-panduan.mjs

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SB_URL = "https://ukblmuvaymkoszpcsxie.supabase.co";
const SB_KEY = "sb_publishable_cHiug_yiGs3kPzNvSrOyWg_UwbKMICU"; // kunci awam (dilindungi RLS)
const REPO = "zex-amad/website-project";
const MARK = "[[ZACK:";

// Pautan luar hanya ke sumber rasmi ini (elak pautan rekaan AI).
const OFFICIAL = ["lppeh.gov.my", "hasil.gov.my", "jpph.gov.my", "napic.jpph.gov.my", "lppsa.gov.my", "bnm.gov.my",
  "kpkt.gov.my", "jkptg.gov.my", "ptg.selangor.gov.my", "akpk.org.my", "kwsp.gov.my", "mbsa.gov.my", "selangor.gov.my", "skm.gov.my", "ctoscredit.com.my"];

const slugify = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // tarikh Malaysia
const out = async (k, v) => { if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `${k}=${oneLine(v)}\n`); };
const BULAN = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];

/* ---------- data ---------- */
async function loadArticles() {
  const dir = path.join(ROOT, "data", "panduan"), list = [];
  for (const f of await fs.readdir(dir).catch(() => [])) {
    if (!f.endsWith(".md")) continue;
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) continue;
    const meta = Object.fromEntries(m[1].split("\n").filter((l) => l.includes(": ")).map((l) => [l.slice(0, l.indexOf(": ")).trim(), l.slice(l.indexOf(": ") + 2).trim()]));
    list.push({ ...meta, slug: meta.slug || f.replace(/\.md$/, ""), body: m[2], draf: m[2].includes(MARK) });
  }
  return list;
}
async function loadAreas() {
  const dir = path.join(ROOT, "data", "kawasan"), list = [];
  for (const f of await fs.readdir(dir).catch(() => [])) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const g = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
    list.push({ kawasan: g.kawasan, href: `/rumah-dijual/${slugify(g.negeri || "Selangor")}/${slugify(g.kawasan)}/` });
  }
  return list;
}
async function loadListings() {
  if (process.env.LISTINGS_JSON) return JSON.parse(await fs.readFile(process.env.LISTINGS_JSON, "utf8"));
  try {
    const res = await fetch(`${SB_URL}/rest/v1/listings?select=id,slug,status,jenis,taman,kawasan,negeri,harga,bilik,keluasan_kps,pegangan,tarikh_terjual&status=in.(dijual,terjual)`, { headers: { apikey: SB_KEY } });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return await res.json();
  } catch (e) { console.warn("Amaran: listing tidak dapat dibaca:", e.message); return []; }
}

/* ---------- pilih topik ---------- */
function pickTopic(topics, articles, listings) {
  const done = new Set(articles.map((a) => a.slug));
  const skip = new Set(String(process.env.SKIP_SLUGS || "").split(",").map((s) => s.trim()).filter(Boolean));
  const forced = process.env.TOPIK?.trim();
  const sold = (k) => listings.filter((l) => l.status === "terjual" && slugify(l.kawasan) === slugify(k));
  const candidates = topics
    .filter((t) => (forced ? t.slug === forced : true))
    .filter((t) => t.jenis === "panduan" || t.jenis === "harga_kawasan")
    .filter((t) => !done.has(t.slug) && (forced || !skip.has(t.slug)))
    .filter((t) => {
      if (t.jenis !== "harga_kawasan") return true;
      const n = sold(t.kawasan).length;
      if (n < (t.min_terjual || 3)) { console.log(`Langkau ${t.slug}: hanya ${n} rekod terjual di ${t.kawasan}.`); return false; }
      return true;
    })
    .sort((a, b) => (a.keutamaan ?? 50) - (b.keutamaan ?? 50));
  return candidates[0] || null;
}

/* ---------- konteks data sebenar ---------- */
function dataContext(topic, listings) {
  const sold = listings.filter((l) => l.status === "terjual"), active = listings.filter((l) => l.status === "dijual");
  const byArea = {};
  for (const l of sold) byArea[l.kawasan] = (byArea[l.kawasan] || 0) + 1;
  const top = Object.entries(byArea).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}: ${n} unit`).join("; ");
  const lines = [
    `Rekod di laman: ${active.length} listing aktif, ${sold.length} rekod terjual (rekod laman sahaja; jumlah sepanjang kerjaya Zack ialah 300+ unit).`,
    top ? `Kawasan dengan rekod terjual terbanyak di laman: ${top}.` : "",
  ];
  if (topic.jenis === "harga_kawasan") {
    const rows = sold.filter((l) => slugify(l.kawasan) === slugify(topic.kawasan)).map((l) => {
      const d = l.tarikh_terjual ? new Date(l.tarikh_terjual) : null;
      return `- ${l.jenis} di ${l.taman}${l.harga ? `, harga diiklan RM${Number(l.harga).toLocaleString("en-MY")}` : ""}${l.keluasan_kps ? `, ${l.keluasan_kps} kps` : ""}${l.pegangan ? `, ${l.pegangan}` : ""}${d ? `, terjual ${BULAN[d.getMonth()]} ${d.getFullYear()}` : ""}`;
    });
    const act = active.filter((l) => slugify(l.kawasan) === slugify(topic.kawasan)).map((l) => `- ${l.jenis} di ${l.taman}, RM${Number(l.harga).toLocaleString("en-MY")}${l.keluasan_kps ? `, ${l.keluasan_kps} kps` : ""}`);
    lines.push(`Rekod terjual Zack di ${topic.kawasan} (gunakan HANYA data ini untuk angka harga kawasan; nyatakan ia harga iklan, bukan harga transaksi rasmi):`, ...rows);
    if (act.length) lines.push(`Listing aktif Zack di ${topic.kawasan}:`, ...act);
  }
  return lines.filter(Boolean).join("\n");
}

/* ---------- Gemini ---------- */
const SCHEMA = {
  type: "OBJECT",
  properties: {
    tajuk: { type: "STRING", description: "Tajuk H1, menarik tetapi tepat, maks 90 aksara" },
    tajuk_seo: { type: "STRING", description: "Tajuk SEO maks 65 aksara sebelum ' | Zack Ahmad', mesti mengandungi kata kunci utama" },
    ringkasan: { type: "STRING", description: "Meta description 140-158 aksara, satu perenggan" },
    body: { type: "STRING", description: "Isi artikel dalam Markdown" },
  },
  required: ["tajuk", "tajuk_seo", "ringkasan", "body"],
};

function buildPrompt(topic, ctx, links, feedback) {
  return `Tulis SATU artikel panduan dalam Bahasa Melayu untuk laman zackahmad.my.

PENULIS: Zack Ahmad, Perunding Hartanah Berdaftar (REN 36121), Legacy Real Property Sdn Bhd. Hampir 10 tahun pengalaman, 300+ unit terjual sekitar Lembah Klang dan Semenanjung. Tulis dalam suara orang pertama ("saya") yang mesra, jelas dan profesional, untuk pemilik dan pembeli rumah biasa.

TOPIK: ${topic.tajuk_cadangan}
KATA KUNCI UTAMA: ${topic.kata_kunci_utama}
KATA KUNCI BERKAITAN (guna secara semula jadi, jangan sumbat): ${topic.kata_kunci.join(", ")}
MAKSUD CARIAN PEMBACA: ${topic.niat}
KATEGORI: ${topic.kategori}

DATA SEBENAR DARI REKOD ZACK (boleh digunakan; jangan tambah angka rekod lain):
${ctx}

PAUTAN DALAMAN YANG DIBENARKAN (guna 2-4 yang paling relevan, format [teks](/laluan/)):
${links.map((l) => `- ${l.href} (${l.label})`).join("\n")}

PAUTAN LUAR: hanya ke laman rasmi ini jika benar-benar membantu, gunakan halaman utama domain sahaja: ${OFFICIAL.join(", ")}.

PERATURAN KUALITI (WAJIB):
1. Jawab maksud carian pembaca dengan lengkap dan praktikal: langkah, contoh pengiraan, senarai semak atau jadual bila sesuai. 900-1,600 patah perkataan.
2. JANGAN reka statistik, kes, nama pelanggan, testimoni, petikan, harga kawasan atau tarikh. Jika tidak pasti tentang angka undang-undang/cukai/kadar, tulis secara umum dan nasihat pembaca semak dengan peguam, LHDN atau bank.
3. Fakta yang berubah (kadar cukai, duti setem, kadar faedah, polisi kerajaan): sebut "setakat ${new Date().getFullYear()}" dan nasihat semak sumber rasmi.
4. JANGAN reka pengalaman peribadi Zack. Sebaliknya, letak tepat SATU perenggan (selepas bahagian paling penting) dalam format ini, berseorangan dalam perenggannya:
   Nota Zack: ${MARK} soalan khusus untuk Zack tentang pengalaman sebenar beliau berkaitan topik ini, cth. kesilapan paling biasa pelanggan beliau, atau tempoh biasa di kawasan beliau]]
5. Format Markdown: mula terus dengan perenggan pengenalan (tiada H1). Guna "## " untuk bahagian utama (5-8 bahagian) dan "### " untuk sub-bahagian. Senarai guna "- " atau "1. ". Jadual guna format | a | b |. Perenggan bermula "Tip:" atau "Penting:" dipaparkan sebagai kotak.
6. Akhiri dengan "## Soalan lazim" (3-5 soalan sebagai "### soalan" diikuti jawapan ringkas), kemudian satu perenggan penutup yang menjemput pembaca WhatsApp Zack tanpa nada jualan berlebihan.
7. Elak ayat pembuka klise ("Dalam dunia hartanah yang pantas ini...") dan elak mengulang kata kunci secara tidak semula jadi.
8. Jangan sebut AI, model bahasa atau Gemini.
${feedback ? `\nDRAF SEBELUM INI DITOLAK KERANA: ${feedback}\nBetulkan perkara ini.` : ""}`;
}

async function callGemini(prompt) {
  if (process.env.GEMINI_MOCK) return JSON.parse(await fs.readFile(process.env.GEMINI_MOCK, "utf8"));
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY tidak ditetapkan. Tambah di GitHub › Settings › Secrets and variables › Actions.");
  const models = [...new Set([process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest"].filter(Boolean))];
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.6 },
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const text = (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
        try { const o = JSON.parse(text); console.log(`Model: ${model}`); return o; } catch { lastErr = new Error(`Jawapan bukan JSON (${model})`); break; }
      }
      lastErr = new Error(`Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 20000 * (attempt + 1))); continue; }
      break; // 400/404: cuba model seterusnya
    }
  }
  throw lastErr;
}

/* ---------- semakan kualiti ---------- */
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
function shingles(s, n = 4) { const w = words(s), set = new Set(); for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(" ")); return set; }
function overlap(a, b) { const A = shingles(a), B = shingles(b); let k = 0; for (const x of A) if (B.has(x)) k++; return A.size ? k / A.size : 0; }

function clean(draft, allowed) {
  let body = String(draft.body || "").replace(/\r/g, "").trim();
  body = body.replace(/^#\s+.*\n+/, ""); // buang H1 jika ada
  const removed = [];
  body = body.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
    if (href.startsWith("/")) { const p = href.split("#")[0]; if (allowed.has(p)) return m; removed.push(href); return text; }
    try { const h = new URL(href).hostname.replace(/^www\./, ""); if (OFFICIAL.some((d) => h === d || h.endsWith("." + d))) return m; } catch { /* pautan rosak */ }
    removed.push(href); return text;
  });
  if (!body.includes(MARK)) {
    const i = body.search(/\n## Soalan lazim/i);
    const note = `Nota Zack: ${MARK} kongsikan satu pengalaman sebenar anda berkaitan topik ini]]`;
    body = i > 0 ? `${body.slice(0, i)}\n\n${note}\n${body.slice(i)}` : `${body}\n\n${note}`;
  }
  return { ...draft, body, removed };
}

function problems(d, topic, articles) {
  const p = [];
  const n = words(d.body).length;
  if (n < 800) p.push(`terlalu pendek (${n} patah perkataan, minimum 800)`);
  if ((d.body.match(/^## /gm) || []).length < 4) p.push("kurang daripada 4 bahagian '## '");
  if (!/## Soalan lazim/i.test(d.body)) p.push("tiada bahagian '## Soalan lazim'");
  const tw = new Set(words(d.tajuk_seo + " " + d.tajuk));
  if (!words(topic.kata_kunci_utama).every((w) => tw.has(w))) p.push(`kata kunci utama "${topic.kata_kunci_utama}" tiada dalam tajuk`);
  for (const a of articles) {
    const o = overlap(d.body, a.body);
    if (o > 0.12) p.push(`terlalu serupa dengan artikel "${a.tajuk}" (${Math.round(o * 100)}% frasa sama)`);
  }
  if (/\b(sebagai (sebuah )?model bahasa|AI language model|Gemini)\b/i.test(d.body)) p.push("menyebut AI");
  return p;
}

/* ---------- utama ---------- */
const topics = JSON.parse(await fs.readFile(path.join(ROOT, "data", "kata-kunci", "topik.json"), "utf8")).topik;
const [articles, areas, listings] = await Promise.all([loadArticles(), loadAreas(), loadListings()]);
const topic = pickTopic(topics, articles, listings);
if (!topic) { console.log("Tiada topik baharu yang layak. Tambah topik dalam data/kata-kunci/topik.json."); await out("slug", ""); process.exit(0); }
console.log(`Topik: ${topic.slug}`);

const links = [
  { href: "/rumah-dijual/", label: "Semua rumah dijual" }, { href: "/terjual/", label: "Rekod jualan Zack" },
  ...articles.filter((a) => !a.draf).map((a) => ({ href: `/panduan/${a.slug}/`, label: a.tajuk })),
  ...areas.map((a) => ({ href: a.href, label: `Ejen hartanah & rumah dijual di ${a.kawasan}` })),
];
const allowed = new Set(links.map((l) => l.href));
const ctx = dataContext(topic, listings);

let draft, issues = [], feedback = "";
for (let round = 0; round < 2; round++) {
  draft = clean(await callGemini(buildPrompt(topic, ctx, links, feedback)), allowed);
  issues = problems(draft, topic, articles);
  if (!issues.length) break;
  feedback = issues.join("; ");
  console.warn(`Draf pusingan ${round + 1} ada masalah: ${feedback}`);
  if (process.env.GEMINI_MOCK) break;
}
if (issues.length) { console.error(`Draf tidak lulus semakan: ${issues.join("; ")}`); process.exit(1); }

const tarikh = today();
const md = `---
tajuk: ${oneLine(draft.tajuk)}
tajuk_seo: ${oneLine(draft.tajuk_seo).replace(/\s*\|\s*Zack Ahmad\s*$/i, "")} | Zack Ahmad
slug: ${topic.slug}
kategori: ${topic.kategori}
tarikh: ${tarikh}
ringkasan: ${oneLine(draft.ringkasan)}
kata_kunci: ${topic.kata_kunci.join(", ")}
sumber_draf: ai (disemak Zack sebelum terbit)
---

${draft.body}
`;
const file = path.join(ROOT, "data", "panduan", `${topic.slug}.md`);
await fs.writeFile(file, md);
console.log(`Ditulis: ${path.relative(ROOT, file)} (${words(draft.body).length} patah perkataan)`);

// Teks Pull Request: apa yang Zack perlu buat
const numbers = draft.body.split(/\n+/).filter((l) => /\d/.test(l) && /(RM|%|peratus|tahun|bulan|hari|kali)/i.test(l) && !l.includes(MARK))
  .map((l) => `- [ ] ${oneLine(l).replace(/^[-*\d.\s|]+/, "").slice(0, 180)}`).slice(0, 15);
const branch = `draf/${topic.slug}`;
const body = `## Draf panduan baharu: ${oneLine(draft.tajuk)}

Kata kunci: **${topic.kata_kunci_utama}** (+ ${topic.kata_kunci.length - 1} berkaitan)

**Artikel ini TIDAK akan terbit selagi penanda \`[[ZACK: ...]]\` belum diganti.**

### Langkah untuk Zack (5–10 minit)
1. Buka [edit fail ini](https://github.com/${REPO}/edit/${branch}/data/panduan/${topic.slug}.md).
2. Cari \`[[ZACK:\` dan ganti seluruh penanda (hingga \`]]\`) dengan 2–4 ayat pengalaman sebenar anda. Kalau tiada, padam perenggan "Nota Zack" itu.
3. Baca sekali lalu dan betulkan apa-apa yang tidak tepat. Semak angka di bawah.
4. Tekan **Commit changes**, kemudian di sini tekan **Merge pull request**. Laman akan terbit dalam ~2 minit.

Tidak sesuai? Tekan **Close pull request**: topik ini tidak akan ditulis semula secara automatik.

### Angka & fakta untuk disemak
${numbers.join("\n") || "- (tiada)"}
${draft.removed.length ? `\n### Pautan yang dibuang automatik (tidak dibenarkan)\n${draft.removed.map((h) => `- ${h}`).join("\n")}` : ""}
`;
if (process.env.PR_BODY) await fs.writeFile(process.env.PR_BODY, body);
await out("slug", topic.slug);
await out("tajuk", draft.tajuk);
await out("branch", branch);
