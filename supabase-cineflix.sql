-- ============================================================
--  Cinéflix — schéma Supabase
--  À coller dans Supabase : SQL Editor → New query → Run
-- ============================================================
--  Trois tables :
--    profils    — qui est qui (un prénom, rien d'autre)
--    elements   — favoris et demandes, un par utilisateur et par titre
--    catalogue  — la liste des identifiants TMDB présents sur le NAS
--  Plus une table admins qui désigne qui voit et traite la file.
-- ============================================================


-- 1. Profils -------------------------------------------------
create table if not exists public.profils (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pseudo  text not null default 'Sans nom',
  maj     timestamptz not null default now()
);
alter table public.profils enable row level security;

drop policy if exists "profils lisibles par les connectes" on public.profils;
drop policy if exists "je cree mon profil"                 on public.profils;
drop policy if exists "je modifie mon profil"              on public.profils;

-- Lisible par tous les connectés : la file de demandes doit pouvoir
-- afficher un prénom à côté de chaque ligne.
create policy "profils lisibles par les connectes"
  on public.profils for select to authenticated using (true);
create policy "je cree mon profil"
  on public.profils for insert to authenticated with check (auth.uid() = user_id);
create policy "je modifie mon profil"
  on public.profils for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- 2. Administrateurs -----------------------------------------
-- Qui traite la file. Ajoute-toi à la main après ta première connexion :
--   insert into public.admins (user_id) values ('<ton-uuid>');
-- (l'UUID se lit dans Authentication → Users, ou dans Profil → Compte.)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

drop policy if exists "je vois si je suis admin" on public.admins;
create policy "je vois si je suis admin"
  on public.admins for select to authenticated using (auth.uid() = user_id);

-- Fonction plutôt que sous-requête répétée : « security definer » lui permet
-- de lire la table admins même quand la politique RLS de l'appelant ne le
-- permettrait pas, ce qui évite une récursion infinie entre les politiques.
create or replace function public.est_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$ select exists (select 1 from public.admins a where a.user_id = auth.uid()) $$;

revoke all on function public.est_admin() from public;
grant execute on function public.est_admin() to authenticated;


-- 3. Éléments : favoris et demandes --------------------------
create table if not exists public.elements (
  user_id  uuid not null references auth.users(id) on delete cascade,
  type     text not null check (type in ('movie','tv')),
  tmdb_id  integer not null,
  titre    text,
  poster   text,
  sortie   text,
  fav      boolean not null default false,
  demande  boolean not null default false,
  -- Statut de la demande, posé par l'administrateur.
  -- « obtenu » n'existe pas ici : la présence dans le catalogue en tient lieu,
  -- pour qu'il n'y ait jamais deux vérités sur ce que contient le serveur.
  statut   text not null default 'demande' check (statut in ('demande','encours','refuse')),
  note     text,
  cree_le  timestamptz not null default now(),
  maj_le   timestamptz not null default now(),
  primary key (user_id, type, tmdb_id)
);
alter table public.elements enable row level security;

create index if not exists elements_demandes_idx
  on public.elements (demande, maj_le desc) where demande;

drop policy if exists "je vois mes elements"        on public.elements;
drop policy if exists "je cree mes elements"        on public.elements;
drop policy if exists "je modifie mes elements"     on public.elements;
drop policy if exists "je supprime mes elements"    on public.elements;

-- Chacun voit ses éléments ; l'administrateur voit toutes les demandes,
-- mais jamais les simples favoris des autres — une liste d'envies reste privée.
create policy "je vois mes elements"
  on public.elements for select to authenticated
  using (auth.uid() = user_id or (demande and public.est_admin()));

create policy "je cree mes elements"
  on public.elements for insert to authenticated
  with check (auth.uid() = user_id);

-- L'utilisateur modifie ses lignes, l'administrateur peut changer le statut
-- de n'importe quelle demande.
create policy "je modifie mes elements"
  on public.elements for update to authenticated
  using (auth.uid() = user_id or public.est_admin())
  with check (auth.uid() = user_id or public.est_admin());

create policy "je supprime mes elements"
  on public.elements for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.elements_touch()
returns trigger language plpgsql as $$
begin new.maj_le := now(); return new; end $$;

drop trigger if exists elements_touch on public.elements;
create trigger elements_touch before insert or update on public.elements
  for each row execute function public.elements_touch();


-- 4. Catalogue ------------------------------------------------
-- Une seule ligne, poussée par le script d'export du NAS avec la clé
-- service_role. Aucune politique d'écriture n'est définie : personne ne peut
-- la modifier depuis l'application, quelles que soient les manipulations.
create table if not exists public.catalogue (
  id      integer primary key default 1 check (id = 1),
  movies  integer[] not null default '{}',
  tv      integer[] not null default '{}',
  maj     timestamptz not null default now()
);
alter table public.catalogue enable row level security;

drop policy if exists "catalogue lisible par les connectes" on public.catalogue;
create policy "catalogue lisible par les connectes"
  on public.catalogue for select to authenticated using (true);

insert into public.catalogue (id) values (1) on conflict do nothing;


-- 5. La file, prête à afficher --------------------------------
-- Jointure des demandes et des prénoms, pour éviter deux appels et une
-- reconstruction côté application.
create or replace view public.file_demandes
with (security_invoker = true) as
  select e.user_id, e.type, e.tmdb_id, e.titre, e.poster, e.sortie,
         e.statut, e.note, e.cree_le, e.maj_le,
         coalesce(p.pseudo, 'Sans nom') as pseudo
  from public.elements e
  left join public.profils p on p.user_id = e.user_id
  where e.demande;

grant select on public.file_demandes to authenticated;
