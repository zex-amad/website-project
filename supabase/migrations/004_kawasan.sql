-- Senarai kawasan + Nota Zack untuk halaman panduan kawasan.
-- Nota Zack dipaparkan di laman (halaman panduan kawasan), jadi jadual ini boleh dibaca umum.
-- Hanya admin boleh tambah / ubah.
-- Tampal dalam Supabase › SQL Editor › New query (BUKAN tab Logs), kemudian tekan Run. Selamat dijalankan lebih dari sekali.

create table if not exists public.kawasan (
  slug         text primary key,
  nama         text not null,
  negeri       text not null default 'Selangor',
  nota_zack    text not null default '',
  dicipta      timestamptz not null default now(),
  dikemaskini  timestamptz not null default now()
);

alter table public.kawasan enable row level security;

drop policy if exists "kawasan boleh dibaca umum" on public.kawasan;
drop policy if exists "admin urus kawasan" on public.kawasan;
create policy "kawasan boleh dibaca umum" on public.kawasan
  for select to anon, authenticated using (true);
create policy "admin urus kawasan" on public.kawasan
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.kawasan to anon;
grant select, insert, update, delete on public.kawasan to authenticated;
