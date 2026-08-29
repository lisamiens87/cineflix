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
-- La vue `file_demandes` est définie TOUT EN BAS de ce fichier, et non ici.
-- Elle lit `profils.avatar`, colonne ajoutée plus loin (v2807r) : définie à
-- cette place, elle échouait sur une base neuve — « column p.avatar does not
-- exist » — et le fichier s'arrêtait là. Une vue vient après les colonnes
-- qu'elle sélectionne.


-- ============================================================
-- v2807r — profils du foyer et gouts
-- ============================================================
-- 1. Le profil s'enrichit : une tête, un compte serveur, un drapeau
--    « a déjà fait le parcours ». Rien de personnel ici : cette table
--    est lisible par tout le foyer, la file de demandes en a besoin.
alter table public.profils
  add column if not exists avatar   jsonb   not null default '{}'::jsonb,
  add column if not exists jellyfin text,
  add column if not exists onboarde boolean not null default false;

-- 2. Les goûts, à part et bien fermés : ce que quelqu'un aime ne
--    regarde que lui, même à l'intérieur du foyer.
create table if not exists public.gouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data    jsonb not null default '{}'::jsonb,
  maj     timestamptz not null default now()
);
alter table public.gouts enable row level security;

drop policy if exists "je lis mes gouts"     on public.gouts;
drop policy if exists "je cree mes gouts"    on public.gouts;
drop policy if exists "je modifie mes gouts" on public.gouts;

create policy "je lis mes gouts"
  on public.gouts for select to authenticated using (auth.uid() = user_id);
create policy "je cree mes gouts"
  on public.gouts for insert to authenticated with check (auth.uid() = user_id);
create policy "je modifie mes gouts"
  on public.gouts for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);



-- ============================================================
-- 3108e — les tables ajoutées au fil des builds
-- ============================================================
-- Ces objets existaient dans la base de production mais PAS dans ce fichier :
-- ils avaient été créés à la main au fur et à mesure. Une base repartie du
-- seul fichier SQL était donc incomplète, et l'app y échouait en silence
-- (PostgREST répond 404 sur une table absente, et la plupart de ces lectures
-- sont enveloppées dans un try/catch qui « dégrade proprement »).
--
-- Tout ce bloc est REJOUABLE sur une base déjà en service : « if not exists »
-- partout, « drop policy if exists » avant chaque politique. Il n'écrase
-- aucune donnée.
--
-- Reconstruction faite à partir des appels réels — app-06 et app-08 côté
-- application, outils-nas/export-jellyfin.py côté serveur. Les types sont
-- déduits de ce qui est écrit et de ce qui est affiché : à confronter au
-- schéma en place avant de rejouer le fichier sur la base de production.


-- 1. Le profil, suite ----------------------------------------
-- `statut` porte le contrôle d'accès (l'app lit 'attente' / 'valide' /
-- 'refuse'), `email` permet à l'administrateur de reconnaître qui demande,
-- `notif_statut` retient ce qui a DÉJÀ été annoncé par notification — sans
-- elle, le cron renverrait la même alerte à chaque passage.
--
-- ⚠️ La valeur par défaut est 'valide', et c'est VOULU : à l'ajout de la
-- colonne, les profils déjà en place doivent rester ouverts. Ce qui met un
-- NOUVEAU compte en attente, c'est le déclencheur ci-dessous, pas ce défaut.
alter table public.profils
  add column if not exists email        text,
  add column if not exists statut       text not null default 'valide',
  add column if not exists notif_statut text;

alter table public.profils drop constraint if exists profils_statut_check;
alter table public.profils
  add constraint profils_statut_check check (statut in ('attente','valide','refuse'));

-- Le verrou dont parle le README : « un déclencheur qui empêche quiconque de
-- se valider soi-même ». Sans lui, n'importe qui pourrait passer son propre
-- profil à 'valide' par un simple PATCH — la politique RLS de `profils`
-- autorise chacun à modifier sa ligne, et elle ne sait pas distinguer une
-- colonne d'une autre.
--
--   à l'insertion : un profil naît toujours en attente ;
--   à la mise à jour : seul un administrateur peut changer `statut`.
--
-- La clé service_role contourne les politiques RLS mais PAS les déclencheurs.
-- L'export n'écrit jamais `statut` (seulement `jellyfin` et `notif_statut`),
-- il n'est donc pas gêné.
create or replace function public.profils_statut_verrou()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.est_admin() then new.statut := 'attente'; end if;
  elsif new.statut is distinct from old.statut and not public.est_admin() then
    new.statut := old.statut;
  end if;
  return new;
end $$;

drop trigger if exists profils_statut_verrou on public.profils;
create trigger profils_statut_verrou before insert or update on public.profils
  for each row execute function public.profils_statut_verrou();


-- 2. Le catalogue, suite -------------------------------------
-- `items` : les fiches compactes du NAS (nom, dates, durée, classification,
-- notes, lectures). C'est ce qui permet de trier la vue « Cinémathèque »
-- comme Jellyfin le fait, sans qu'aucun serveur ne trie à la place de l'app.
alter table public.catalogue
  add column if not exists items jsonb not null default '[]'::jsonb;

-- Un compte en attente ne doit RIEN voir. La politique posée plus haut disait
-- « using (true) » : elle ouvrait le catalogue à tout compte authentifié, donc
-- à quiconque venait de s'inscrire et n'avait pas encore été validé. Le verrou
-- est ici, pas dans l'interface.
drop policy if exists "catalogue lisible par les connectes" on public.catalogue;
create policy "catalogue lisible par les connectes"
  on public.catalogue for select to authenticated
  using (exists (select 1 from public.profils p
                 where p.user_id = auth.uid() and p.statut = 'valide'));


-- 3. Les suggestions écartées --------------------------------
-- « Pas pour moi » sur une suggestion. Une DATE, pas un drapeau : le film
-- revient de lui-même au bout de six mois. Le serveur fait foi ; `db.ecartes`
-- n'en est que l'écho local, pour que l'écran réponde sans attendre le réseau.
create table if not exists public.ecartes (
  user_id   uuid not null references auth.users(id) on delete cascade,
  tmdb_id   integer not null,
  ecarte_le timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);
alter table public.ecartes enable row level security;

drop policy if exists "je vois mes ecartes"     on public.ecartes;
drop policy if exists "je cree mes ecartes"     on public.ecartes;
drop policy if exists "je modifie mes ecartes"  on public.ecartes;
drop policy if exists "je supprime mes ecartes" on public.ecartes;

-- Aussi fermé que `gouts` : ce qu'on refuse de regarder ne regarde que soi.
create policy "je vois mes ecartes"
  on public.ecartes for select to authenticated using (auth.uid() = user_id);
create policy "je cree mes ecartes"
  on public.ecartes for insert to authenticated with check (auth.uid() = user_id);
-- L'app pousse en « merge-duplicates » : un upsert a besoin du droit de
-- MODIFIER, sinon le second écart sur le même film échoue.
create policy "je modifie mes ecartes"
  on public.ecartes for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "je supprime mes ecartes"
  on public.ecartes for delete to authenticated using (auth.uid() = user_id);


-- 4. Les notes Télérama --------------------------------------
-- Remplie par l'export du NAS, lue par tout le foyer : c'est elle qui met les
-- « T » sur les vignettes. Indépendante de la bibliothèque — elle note aussi
-- des titres qui ne sont pas sur le serveur.
--
-- La ligne « __semis__ » n'est pas une note : elle range la progression du
-- balayage TMDB dans `verdict`, au format JSON. Elle porte t = 0, et l'app ne
-- lit que « t > 0 » — elle ne la voit donc jamais.
create table if not exists public.telerama (
  cle     text primary key,
  t       smallint not null default 0,
  verdict text,
  maj     date
);
alter table public.telerama enable row level security;

drop policy if exists "telerama lisible par les connectes" on public.telerama;
create policy "telerama lisible par les connectes"
  on public.telerama for select to authenticated using (true);
-- Aucune politique d'écriture : seul l'export, avec la clé service_role,
-- alimente cette table.


-- 5. Les sorties physiques -----------------------------------
-- Le calendrier Blu-ray / 4K relevé par l'export, apparié à TMDB quand c'est
-- possible. `cle` est l'identifiant stable de la source (son slug), ce qui
-- permet de ne réécrire que les lignes dont la date a bougé.
create table if not exists public.sorties_phys (
  cle      text primary key,
  titre    text,
  vo       text,
  annee    text,
  "date"   date,
  edition  text,
  uhd      boolean not null default false,
  prix     numeric,
  tmdb_id  integer,
  poster   text,
  maj      date
);
alter table public.sorties_phys enable row level security;

create index if not exists sorties_phys_date_idx on public.sorties_phys ("date");

drop policy if exists "sorties lisibles par les connectes" on public.sorties_phys;
create policy "sorties lisibles par les connectes"
  on public.sorties_phys for select to authenticated using (true);
-- Écriture réservée à l'export, comme pour `telerama`.


-- 6. Les abonnements aux notifications -----------------------
-- Un appareil, une ligne. L'endpoint que rend le navigateur est unique par
-- appareil et par installation : il fait une clé primaire naturelle, et il
-- suffit à l'appareil pour retirer SON abonnement quand on coupe les notifs.
create table if not exists public.push_abonnements (
  endpoint text primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  p256dh   text not null,
  auth     text not null,
  cree_le  timestamptz not null default now()
);
alter table public.push_abonnements enable row level security;

create index if not exists push_abonnements_user_idx
  on public.push_abonnements (user_id);

drop policy if exists "je vois mes abonnements"     on public.push_abonnements;
drop policy if exists "je cree mes abonnements"     on public.push_abonnements;
drop policy if exists "je modifie mes abonnements"  on public.push_abonnements;
drop policy if exists "je supprime mes abonnements" on public.push_abonnements;

create policy "je vois mes abonnements"
  on public.push_abonnements for select to authenticated using (auth.uid() = user_id);
create policy "je cree mes abonnements"
  on public.push_abonnements for insert to authenticated with check (auth.uid() = user_id);
-- Là encore l'app pousse en « merge-duplicates » : réactiver les notifications
-- sur un appareil déjà connu est une MISE À JOUR, pas une insertion.
create policy "je modifie mes abonnements"
  on public.push_abonnements for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- L'app supprime par endpoint seul, sans filtrer sur l'utilisateur : c'est la
-- politique qui garantit qu'elle ne peut effacer que le sien.
create policy "je supprime mes abonnements"
  on public.push_abonnements for delete to authenticated using (auth.uid() = user_id);


-- 7. Le journal du NAS ---------------------------------------
-- Un bloc-notes clé → valeur qu'écrit l'export : dernier passage, incidents,
-- et surtout « comptes_jf », la liste des comptes Jellyfin séparés par « · ».
-- Avant, cette liste était écrite en dur dans config.js et vieillissait à
-- chaque compte créé.
create table if not exists public.journal_nas (
  cle    text primary key,
  valeur text,
  maj    timestamptz not null default now()
);
alter table public.journal_nas enable row level security;

drop policy if exists "journal lisible par les connectes" on public.journal_nas;
-- Volontairement étroit : l'app ne lit QUE « comptes_jf ». Ouvrir la table
-- entière exposerait les messages de diagnostic de l'export à tout le foyer,
-- sans que personne n'en ait l'usage.
create policy "journal lisible par les connectes"
  on public.journal_nas for select to authenticated using (cle = 'comptes_jf');


-- 8. Les mots-clés TMDB --------------------------------------
-- Le cache qui fait tourner les recettes de la taxonomie (app-11) sans
-- rappeler TMDB à chaque fois. L'app ne lit JAMAIS cette table : l'export y
-- puise pour coller les mots-clés sur les fiches de `catalogue.items`.
-- Clé primaire composite, d'où le « on_conflict=type,tmdb_id » que l'export
-- passe explicitement — sans lui, PostgREST répond 409 et perd le lot.
create table if not exists public.motscles_films (
  type    text not null check (type in ('movie','tv')),
  tmdb_id integer not null,
  mc      integer[] not null default '{}',
  primary key (type, tmdb_id)
);
alter table public.motscles_films enable row level security;
-- Aucune politique, et c'est intentionnel : seule la clé service_role y touche.



-- 9. Ce qu'un administrateur a le droit de faire -------------
-- Sans ces politiques, les écrans « Demandes d'accès » et « Membres » ne
-- peuvent RIEN : la politique « je modifie mon profil » ne couvre que sa
-- propre ligne, donc valider quelqu'un d'autre ne touchait aucune ligne.
--
-- Et ça ne lève même pas d'erreur : PostgREST répond 200 avec une liste VIDE.
-- C'est le piège que l'app documente à trois endroits (« une validation a pu
-- paraître réussie tout en ne changeant rien du tout ») et contre lequel elle
-- compte les lignes renvoyées. Ces politiques existent forcément déjà dans la
-- base en service — sans elles, aucune validation n'aurait jamais marché.

drop policy if exists "l'admin modifie les profils"  on public.profils;
drop policy if exists "l'admin supprime un profil"   on public.profils;

-- Valider ou refuser un accès, relier quelqu'un à son compte Jellyfin.
-- Le changement de `statut` reste soumis au déclencheur posé plus haut : la
-- politique dit QUI peut écrire, le déclencheur dit QUI peut valider.
create policy "l'admin modifie les profils"
  on public.profils for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

create policy "l'admin supprime un profil"
  on public.profils for delete to authenticated using (public.est_admin());

-- Retirer un membre efface aussi ses données : la fenêtre de confirmation le
-- promet, il faut donc que ce soit vrai. Rien ne part en cascade tout seul —
-- ces tables référencent le COMPTE de connexion (auth.users), pas `profils` —
-- d'où ces trois droits, que l'app exerce dans cet ordre avant le profil.
--
-- Un DROIT DE SUPPRESSION, pas un droit de lecture : l'administrateur peut
-- effacer les goûts et les écarts d'un membre qui s'en va, il ne peut
-- toujours pas les LIRE. La vie privée du foyer tient à cette distinction.
drop policy if exists "l'admin supprime les elements d'un membre" on public.elements;
drop policy if exists "l'admin supprime les gouts d'un membre"    on public.gouts;
drop policy if exists "l'admin supprime les ecartes d'un membre"  on public.ecartes;

create policy "l'admin supprime les elements d'un membre"
  on public.elements for delete to authenticated using (public.est_admin());
create policy "l'admin supprime les gouts d'un membre"
  on public.gouts for delete to authenticated using (public.est_admin());
create policy "l'admin supprime les ecartes d'un membre"
  on public.ecartes for delete to authenticated using (public.est_admin());

-- ============================================================
-- La file, prête à afficher  (annoncée en 5, posée ici)
-- ============================================================
-- Jointure des demandes et des prénoms, pour éviter deux appels et une
-- reconstruction côté application. En fin de fichier parce qu'elle dépend de
-- `profils.avatar` : toutes les colonnes qu'elle lit existent à ce point.
create or replace view public.file_demandes
with (security_invoker = true) as
  select e.user_id, e.type, e.tmdb_id, e.titre, e.poster, e.sortie,
         e.statut, e.note, e.cree_le, e.maj_le,
         coalesce(p.pseudo, 'Sans nom') as pseudo,
         p.avatar as avatar
  from public.elements e
  left join public.profils p on p.user_id = e.user_id
  where e.demande;

grant select on public.file_demandes to authenticated;
