// Supabase Edge Function: rebuild-site
// Cetuskan binaan semula laman zackahmad.my (GitHub Actions "Bina & terbit laman")
// sebaik Zack simpan, padam atau susun semula listing di admin.html.
//
// Secret yang perlu ditetapkan di Supabase › Edge Functions › Secrets:
//   GH_DISPATCH_TOKEN – fine-grained token GitHub, repo zex-amad/website-project sahaja,
//                       kebenaran "Actions: Read and write". JANGAN letak di laman atau GitHub.
// Verify JWT: OFF (function semak sendiri bahawa pemanggil ialah admin).

import { createClient } from "npm:@supabase/supabase-js@2";

const REPO = "zex-amad/website-project";
const WORKFLOW = "deploy.yml";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

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

async function gh(token: string, path: string, init: RequestInit = {}) {
  return await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "zackahmad-admin",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const publicKey = key("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    const token = Deno.env.get("GH_DISPATCH_TOKEN");
    if (!publicKey) return json({ error: "Kunci Supabase tiada dalam Edge Function." }, 500);
    if (!token) return json({ error: "GH_DISPATCH_TOKEN belum ditetapkan di Supabase Secrets." }, 500);

    // Hanya admin yang log masuk
    const asUser = createClient(url, publicKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: isAdmin, error: adminErr } = await asUser.rpc("is_admin");
    if (adminErr) return json({ error: "Semakan admin gagal: " + adminErr.message }, 403);
    if (!isAdmin) return json({ error: "Hanya admin boleh bina semula laman. Sila log masuk semula." }, 403);

    const body = await req.json().catch(() => ({}));

    // Semak status binaan terkini
    if (body.status) {
      const r = await gh(token, `/actions/workflows/${WORKFLOW}/runs?per_page=1`);
      if (!r.ok) return json({ error: `GitHub ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
      const run = (await r.json()).workflow_runs?.[0];
      return json({ ok: true, run: run && { status: run.status, conclusion: run.conclusion, created_at: run.created_at, updated_at: run.updated_at, event: run.event } });
    }

    // Cetuskan binaan
    const r = await gh(token, `/actions/workflows/${WORKFLOW}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
    if (r.status !== 204) {
      const t = (await r.text()).slice(0, 300);
      const hint = r.status === 401 ? " (token tidak sah / tamat tempoh)" : r.status === 403 || r.status === 404 ? " (token tiada kebenaran Actions: Read and write untuk repo ini)" : "";
      return json({ error: `GitHub ${r.status}${hint}: ${t}` }, 502);
    }
    return json({ ok: true, triggered_at: new Date().toISOString() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
