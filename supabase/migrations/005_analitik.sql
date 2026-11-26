-- Analitik ringkas untuk halaman listing (tanpa cookie, tanpa data peribadi).
-- Pelawat dikenal pasti dengan ID rawak tanpa nama yang disimpan di pelayar mereka sendiri.
-- Pelawat awam hanya boleh MENAMBAH acara; hanya admin boleh membaca.
-- Tampal dalam Supabase › SQL Editor › New query (BUKAN tab Logs), kemudian tekan Run. Selamat dijalankan lebih dari sekali.

create table if not exists public.analitik_acara (
  id          bigint generated always as identity primary key,
  listing_id  bigint,
  jenis       text not null,
  pelawat     text not null,
  sumber      text not null default 'terus',
  peranti     text not null default 'lain',
  nilai       integer,
  dicipta     timestamptz not null default now(),
  constraint jenis_sah check (jenis in ('lihat','whatsapp','telefon','kalkulator','gambar','skrol50','skrol90','masa')),
  constraint pelawat_pendek check (char_length(pelawat) between 8 and 40),
  constraint sumber_pendek check (char_length(sumber) <= 20),
  constraint peranti_pendek check (char_length(peranti) <= 10),
  constraint nilai_munasabah check (nilai is null or (nilai >= 0 and nilai <= 86400))
);

create index if not exists analitik_listing_masa on public.analitik_acara (listing_id, dicipta);

alter table public.analitik_acara enable row level security;

drop policy if exists "awam tambah acara" on public.analitik_acara;
drop policy if exists "admin baca acara" on public.analitik_acara;
drop policy if exists "admin padam acara" on public.analitik_acara;
create policy "awam tambah acara" on public.analitik_acara
  for insert to anon, authenticated with check (dicipta > now() - interval '5 minutes' and dicipta < now() + interval '5 minutes');
create policy "admin baca acara" on public.analitik_acara
  for select to authenticated using (public.is_admin());
create policy "admin padam acara" on public.analitik_acara
  for delete to authenticated using (public.is_admin());

revoke all on public.analitik_acara from anon;
grant insert on public.analitik_acara to anon;
grant insert, select, delete on public.analitik_acara to authenticated;

-- Ringkasan prestasi setiap listing untuk tempoh tertentu (hari = 0 bermaksud semua masa).
-- Hanya admin boleh memanggil.
create or replace function public.prestasi_listing(hari integer default 30)
returns table (
  listing_id bigint,
  pelawat_unik bigint,
  pelawat_unik_lepas bigint,
  paparan bigint,
  whatsapp bigint,
  telefon bigint,
  kalkulator bigint,
  gambar bigint,
  skrol50 bigint,
  skrol90 bigint,
  purata_saat numeric,
  sumber jsonb,
  peranti jsonb
)
language sql
security definer
set search_path = public
as $$
  with a as (
    select * from analitik_acara
    where public.is_admin() and listing_id is not null
  ),
  semasa as (
    select * from a where hari = 0 or dicipta >= now() - make_interval(days => hari)
  ),
  lepas as (
    select listing_id, count(distinct pelawat) as n from a
    where hari > 0 and dicipta >= now() - make_interval(days => hari * 2) and dicipta < now() - make_interval(days => hari)
      and jenis = 'lihat'
    group by listing_id
  ),
  src as (
    select listing_id, jsonb_object_agg(sumber, n) as j from (
      select listing_id, sumber, count(distinct pelawat) as n from semasa where jenis = 'lihat' group by 1, 2
    ) x group by 1
  ),
  dev as (
    select listing_id, jsonb_object_agg(peranti, n) as j from (
      select listing_id, peranti, count(distinct pelawat) as n from semasa where jenis = 'lihat' group by 1, 2
    ) x group by 1
  )
  select s.listing_id,
    count(distinct s.pelawat) filter (where s.jenis = 'lihat'),
    coalesce(max(l.n), 0),
    count(*) filter (where s.jenis = 'lihat'),
    count(distinct s.pelawat) filter (where s.jenis = 'whatsapp'),
    count(distinct s.pelawat) filter (where s.jenis = 'telefon'),
    count(distinct s.pelawat) filter (where s.jenis = 'kalkulator'),
    count(*) filter (where s.jenis = 'gambar'),
    count(distinct s.pelawat) filter (where s.jenis = 'skrol50'),
    count(distinct s.pelawat) filter (where s.jenis = 'skrol90'),
    round(avg(s.nilai) filter (where s.jenis = 'masa'), 0),
    coalesce(max(src.j::text)::jsonb, '{}'::jsonb),
    coalesce(max(dev.j::text)::jsonb, '{}'::jsonb)
  from semasa s
  left join lepas l on l.listing_id = s.listing_id
  left join src on src.listing_id = s.listing_id
  left join dev on dev.listing_id = s.listing_id
  group by s.listing_id;
$$;

revoke all on function public.prestasi_listing(integer) from public, anon;
grant execute on function public.prestasi_listing(integer) to authenticated;
