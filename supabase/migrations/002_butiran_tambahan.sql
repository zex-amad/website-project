-- Butiran tambahan untuk halaman listing (SEO & pembeli).
-- Tampal dalam Supabase › SQL Editor › New query, kemudian tekan Run.
-- Selamat dijalankan lebih dari sekali.

alter table public.listings
  add column if not exists ringkasan              text not null default '',
  add column if not exists keluasan_tanah         text not null default '',
  add column if not exists status_lot             text not null default '',
  add column if not exists arah                   text not null default '',
  add column if not exists keadaan                text not null default '',
  add column if not exists perabot                text not null default '',
  add column if not exists yuran_penyelenggaraan  numeric(10, 2),
  add column if not exists kemudahan              text not null default '',
  add column if not exists nota_zack              text not null default '';

-- Kapsyen gambar disimpan dalam lajur sedia ada `gambar` (jsonb): [{ "path", "url", "kapsyen" }]
