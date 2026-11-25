-- Maklumat listing daripada ejen lain (co-broke). PERIBADI: hanya admin boleh baca/tulis.
-- Disimpan dalam jadual berasingan kerana jadual `listings` boleh dibaca oleh orang awam.
-- Tampal dalam Supabase › SQL Editor › New query, kemudian tekan Run. Selamat dijalankan lebih dari sekali.

create table if not exists public.listing_ejen_lain (
  listing_id   bigint primary key references public.listings(id) on delete cascade,
  nama_ejen    text not null default '',
  telefon_ejen text not null default '',
  pautan       text not null default '',
  nota         text not null default '',
  dikemaskini  timestamptz not null default now()
);

alter table public.listing_ejen_lain enable row level security;

drop policy if exists "admin sahaja baca ejen lain" on public.listing_ejen_lain;
drop policy if exists "admin sahaja tulis ejen lain" on public.listing_ejen_lain;
create policy "admin sahaja baca ejen lain" on public.listing_ejen_lain
  for select to authenticated using (public.is_admin());
create policy "admin sahaja tulis ejen lain" on public.listing_ejen_lain
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tiada akses langsung untuk pelawat awam (anon)
revoke all on public.listing_ejen_lain from anon;
grant select, insert, update, delete on public.listing_ejen_lain to authenticated;
