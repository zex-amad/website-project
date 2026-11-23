// Supabase Edge Function: telegram-post
// Hantar listing "Dijual" ke Telegram channel apabila Zack tekan "Simpan & terbitkan" di admin.html.
//
// Secrets yang perlu ditetapkan di Supabase › Edge Functions › Secrets:
//   TELEGRAM_BOT_TOKEN  – token dari @BotFather (JANGAN letak di laman atau GitHub)
//   TELEGRAM_CHAT_ID    – @namachannel (channel awam) atau -100xxxxxxxxxx (channel peribadi)

import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://zackahmad.my";
const WHATSAPP = "60196071970";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Baca kunci baharu (SUPABASE_*_KEYS) atau kunci lama (SUPABASE_ANON_KEY / SERVICE_ROLE_KEY)
function key(legacy: string, modern: string): string | undefined {
  const old = Deno.env.get(legacy);
  if (old) return old;
  const raw = Deno.env.get(modern);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    return parsed.default ?? Object.values(parsed)[0];
  } catch {
    return raw;
  }
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

function rm(n: unknown) {
  return n === null || n === undefined || n === "" ? null : Number(n).toLocaleString("en-MY");
}

function caption(l: Record<string, any>) {
  const title = `${l.jenis} di ${l.taman}, ${l.kawasan}`;
  const specs = [
    l.bilik != null ? `${l.bilik} bilik` : "",
    l.bilik_air != null ? `${l.bilik_air} bilik air` : "",
    l.keluasan_kps != null ? `${rm(l.keluasan_kps)} kps` : "",
  ].filter(Boolean).join(" · ");
  const wa = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Salam Zack, saya berminat dengan ${title} (ID #${l.id}).`)}`;
  let desc = String(l.penerangan ?? "").trim();
  if (desc.length > 350) desc = desc.slice(0, 347) + "…";

  const lines = [
    `🏠 <b>DIJUAL: ${esc(title)}</b>`,
    "",
    rm(l.harga) ? `💰 <b>RM ${rm(l.harga)}</b>` : "",
    specs ? `🛏 ${esc(specs)}` : "",
    l.pegangan ? `📄 ${esc(l.pegangan)}` : "",
    `📍 ${esc([l.kawasan, l.negeri].filter(Boolean).join(", "))}`,
    desc ? `\n${esc(desc)}` : "",
    "",
    `📲 <a href="${wa}">WhatsApp Zack</a> · 🌐 <a href="${SITE}/#hartanah-${l.id}">zackahmad.my</a>`,
    `<i>Zack Ahmad · Perunding Hartanah Berdaftar REN 36121 · Legacy Real Property Sdn Bhd</i>`,
  ];
  return lines.filter((x) => x !== "").join("\n").slice(0, 1024);
}

async function tg(token: string, method: string, payload: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = await res.json();
  if (!out.ok) throw new Error(`Telegram: ${out.description ?? res.status}`);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const publicKey = key("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    const secretKey = key("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chat = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!publicKey || !secretKey) return json({ error: "Kunci Supabase tiada dalam Edge Function." }, 500);
    if (!token || !chat) return json({ error: "TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum ditetapkan di Secrets." }, 500);

    // 1. Pastikan pemanggil ialah admin (log masuk di admin.html)
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
    const { data: isAdmin, error: adminErr } = await asUser.rpc("is_admin");
    if (adminErr || !isAdmin) return json({ error: "Hanya admin boleh hantar ke Telegram." }, 403);

    // 2. Ambil listing
    const { id, force } = await req.json();
    const db = createClient(url, secretKey);
    const { data: l, error } = await db.from("listings").select("*").eq("id", id).single();
    if (error || !l) return json({ error: "Listing tidak dijumpai." }, 404);

    if (l.status !== "dijual") return json({ skipped: "Hanya listing berstatus Dijual dihantar." });
    if (!l.hantar_telegram) return json({ skipped: "Pilihan 'Hantar ke Telegram' tidak ditanda." });
    if (l.telegram_dihantar_pada && !force) return json({ skipped: "Listing ini sudah dihantar sebelum ini." });

    // 3. Hantar ke channel
    const text = caption(l);
    const photos: string[] = (l.gambar ?? []).map((g: { url: string }) => g.url).filter(Boolean).slice(0, 10);
    if (photos.length >= 2) {
      await tg(token, "sendMediaGroup", {
        chat_id: chat,
        media: photos.map((p, i) => (i === 0 ? { type: "photo", media: p, caption: text, parse_mode: "HTML" } : { type: "photo", media: p })),
      });
    } else if (photos.length === 1) {
      await tg(token, "sendPhoto", { chat_id: chat, photo: photos[0], caption: text, parse_mode: "HTML" });
    } else {
      await tg(token, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true });
    }

    // 4. Tandakan sudah dihantar
    const sentAt = new Date().toISOString();
    await db.from("listings").update({ telegram_dihantar_pada: sentAt }).eq("id", id);
    return json({ ok: true, telegram_dihantar_pada: sentAt });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
