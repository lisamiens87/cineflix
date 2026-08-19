"use strict";
/* ============================ Fiche d'un titre ============================ */

function ouvrirFiche(id, type, from){
  ui.fiche = { id:id, type:type, loading:true, data:null, dates:null };
  go('fiche', {id:id, type:type, from: from || (view === 'fiche' ? params.from : view)});
  chargerFiche();
}

async function chargerFiche(){
  const id = params.id, type = params.type;
  try{
    /* recommendations vient avec la fiche : les suggestions du bas ne coûtent
       aucune requête supplémentaire. */
    const extra = type === 'movie' ? 'credits,release_dates,watch/providers,videos,recommendations'
                                   : 'credits,watch/providers,videos,recommendations';
    /* include_video_language : sans lui, TMDB ne renvoie que les vidéos dans la
       langue demandée, et la plupart des titres n'ont pas de bande-annonce VF.
       On demande donc fr, en, et celles sans langue déclarée. */
    const d = await tmdb('/'+type+'/'+id, { append_to_response: extra,
                                            include_video_language: 'fr,en,null' });
    /* Bande-annonce en VO : la langue d'origine n'est connue qu'une fois la
       fiche reçue. Pour un titre ni français ni anglais (coréen, japonais…),
       la requête ci-dessus n'a donc pas pu ramener ses vidéos VO — on les
       cherche dans une seconde, toute petite, et on remplace la liste. */
    const lo = d && d.original_language;
    if(lo && lo !== 'fr' && lo !== 'en'){
      try{
        const vids = await tmdb('/'+type+'/'+id+'/videos',
                                { include_video_language: lo+',fr,en,null' });
        if(vids && vids.results && vids.results.length) d.videos = vids;
      }catch(_){ /* tant pis : on garde fr/en */ }
    }
    if(!ui.fiche || ui.fiche.id !== id) return;
    ui.fiche = { id:id, type:type, loading:false, data:d,
                 dates: type === 'movie' ? extraireDates((d.release_dates||{}).results, db.region) : null };
    if(type === 'movie') cacheDates[id] = ui.fiche.dates;
  }catch(e){
    if(!ui.fiche || ui.fiche.id !== id) return;
    ui.fiche = { id:id, type:type, loading:false,
      error: e.message === 'BADKEY' ? 'Clé TMDB refusée' : 'Impossible de charger la fiche' };
  }
  if(view === 'fiche') render();
  /* Les titres « avec tel acteur » arrivent après : la fiche s'affiche tout
     de suite, la rangée se glisse dessous une seconde plus tard. */
  chargerAvecActeurs();
}

/* ---------- Le tableau des trois sorties ---------- */
function blocSorties(dates){
  if(!dates) return '';
  const t = todayISO();
  const lignes = [
    { k:TYPE_SALLE, ic:'salle',  titre:'Au cinéma',      sousPasse:'Sorti en salle',       sousFutur:'Sortie en salle' },
    { k:TYPE_NUM,   ic:'nuage',  titre:'Numérique',      sousPasse:'Disponible en VOD',    sousFutur:'Location / achat' },
    { k:TYPE_PHYS,  ic:'disque', titre:'Blu-ray / DVD',  sousPasse:'Édition physique sortie', sousFutur:'Édition physique' }
  ];
  const corps = lignes.map(l=>{
    const iso = dates[l.k];
    if(!iso)
      return '<div class="srt rien"><div class="ic">'+I[l.ic]+'</div>'+
        '<div class="lbl"><b>'+l.titre+'</b><span>Aucune date annoncée</span></div>'+
        '<div class="val">—</div></div>';
    const passe = iso <= t;
    return '<div class="srt '+(passe?'passe':'futur')+'">'+
      '<div class="ic">'+I[l.ic]+'</div>'+
      '<div class="lbl"><b>'+l.titre+'</b><span>'+(passe?l.sousPasse:l.sousFutur)+'</span></div>'+
      '<div class="val">'+fmtDateCourt(iso)+' '+year(iso)+'<br>'+
        '<span class="tiny muted">'+esc(relatif(iso))+'</span></div>'+
    '</div>';
  }).join('');

  const src = dates.source && dates.source !== (db.region||'FR')
    ? '<div class="credit">Dates non renseignées pour la France : celles affichées sont '+
      'celles de '+esc(dates.source)+'.</div>' : '';
  return '<div class="sectitle">Quand peut-on le voir</div><div class="sorties">'+corps+'</div>'+src+
    blocSeances(dates);
}

/* ---------- Séances près de chez soi ----------
   Uniquement pour un film encore à l'affiche (sorti en salle depuis moins de
   sept semaines). Il n'existe pas d'accès public fiable aux séances des
   cinémas français (Allociné n'a pas d'API officielle) : plutôt que
   d'afficher des horaires inventés, le bouton ouvre la recherche des séances
   du film autour de la ville enregistrée dans les réglages — les horaires
   affichés là-bas sont les vrais. */
function blocSeances(dates){
  const iso = dates && dates[TYPE_SALLE];
  if(!iso) return '';
  const t = todayISO();
  if(iso > t) return '';
  if((new Date(t) - new Date(iso)) / 86400000 > 49) return '';
  return '<div class="wrap" style="padding-top:6px">'+
    '<button class="btn ghost block" onclick="ouvrirSeances()">'+
    I.salle+' Séances près de chez moi</button></div>';
}
function ouvrirSeances(){
  const o = ficheObjet();
  const titre = o.title || o.name || '';
  if(!db.ville){
    return openSheet('<h3>Ta ville ?</h3>'+
      '<p class="small muted" style="margin:0 0 8px">Renseigne ta ville dans les réglages : '+
      'ce bouton ouvrira alors les séances autour de chez toi.</p>'+
      '<button class="opt" onclick="closeSheet();go(\'reglages\',{from:\'profil\'})">Ouvrir les réglages</button>'+
      '<button class="opt" onclick="closeSheet()">Annuler</button>');
  }
  window.open('https://www.google.com/search?q='+
    encodeURIComponent('séances '+titre+' '+db.ville), '_blank', 'noopener');
}

/* ---------- Boutons d'action ---------- */
/* Les plateformes retenues qui proposent ce titre par abonnement en France,
   d'après TMDB/JustWatch. Le repli par NOM rattrape les déclinaisons du même
   service (« Canal+ Amazon Channel »…) — mais seulement pour les noms assez
   longs pour être sans équivoque : « Max », « M6+ » ou « Arte » en préfixe
   attraperaient n'importe quoi. Pour ceux-là, l'identifiant exact suffit. */
function platsDuTitre(o){
  const p = ((o['watch/providers']||{}).results||{})[db.region||'FR'];
  const abo = (p && p.flatrate) || [];
  return PLATEFORMES.map(pf => {
    const f = abo.find(f => f.provider_id === pf.id ||
      (pf.nom.length >= 6 &&
       (f.provider_name||'').toLowerCase().indexOf(pf.nom.toLowerCase()) === 0));
    return f ? Object.assign({}, pf, { logo: f.logo_path || '' }) : null;
  }).filter(Boolean);
}
function ouvrirPlateforme(id){
  const pf = PLATEFORMES.find(p=>p.id===id);
  if(!pf) return;
  const o = ficheObjet();
  window.open(pf.lien(o.title || o.name || ''), '_blank', 'noopener');
}

/* Un seul bouton principal, qui dit exactement où on en est :
   Demander → Demandé → En cours → Regarder.

   Exception : quand le titre n'est PAS sur le serveur mais qu'une plateforme
   d'abonnement le propose, c'est elle qu'il faut montrer — « Demander » n'est
   pas la première chose à faire d'un film qu'on peut lancer tout de suite.

   Jusqu'en 3007d cette exception était conditionnée par `ui.presence`,
   c'est-à-dire par l'ONGLET de Découvrir ouvert en dernier. Le même film,
   avec les mêmes données, changeait donc de bouton selon la porte par
   laquelle on arrivait : « Netflix » depuis l'onglet Plateformes, mais
   « Demander sur Cinéflix » depuis le guide, la recherche ou l'accueil.
   Vérifié le 06/08 sur « The Debt Collector » — sur Netflix, absent du
   serveur, et l'app proposait de le demander. Le bouton suit désormais le
   FILM, plus la provenance. */
function actionsFiche(o, type){
  const st = statut(type, o.id);
  const it = item(type, o.id);
  const fav = !!(it && it.fav);
  const ref = 'ficheObjet()';

  const coeur = '<button class="btn ghost" style="flex:0 0 54px'+(fav?';color:var(--accent)':'')+
    '" onclick="basculerFavori('+ref+',\''+type+'\');render()" aria-label="Favori">'+
    (fav ? I.coeurPlein : I.coeur)+'</button>';

  /* Le posséder passe avant tout : inutile d'envoyer vers Netflix un film
     qui est déjà chez soi, en meilleure qualité et sans abonnement. */
  const dispo = st === 'obtenu' ? [] : platsDuTitre(o);
  if(dispo.length){
    /* Chaque bouton porte le sigle et la couleur de sa plateforme. */
    const boutons = dispo.map(pf =>
      '<button class="btn plat '+pf.cl+'" onclick="ouvrirPlateforme('+pf.id+')">'+
      (pf.logo ? '<img class="plogo" src="'+IMG(pf.logo,'w92')+'" alt="">' : '')+
      esc(pf.nom)+'</button>').join('');
    /* « Demander sur Cinéflix » ne disparaît pas pour autant, il descend d'un
       rang : être sur Netflix aujourd'hui n'empêche pas de vouloir le titre
       chez soi pour toujours. Et si la demande est déjà partie, c'est son
       état qu'on rappelle plutôt qu'une invitation à la refaire. */
    const second =
      (st === 'demande' || st === 'encours')
        ? '<button class="lienplat" onclick="menuDemande('+o.id+',\''+type+'\')">'+
          (st === 'demande' ? 'Déjà demandé sur Cinéflix' : 'En cours d’ajout sur Cinéflix')+'</button>'
      : st === 'refuse'
        ? '<button class="lienplat" onclick="menuDemande('+o.id+',\''+type+'\')">Demande refusée</button>'
        : '<button class="lienplat" onclick="demander('+ref+',\''+type+'\');render()">'+
          'Le demander aussi sur Cinéflix</button>';
    return '<div class="actions plats">'+boutons+coeur+'</div>'+
           '<div class="credit">'+second+'</div>';
  }

  let principal;
  if(st === 'obtenu'){
    principal = '<button class="btn vert" onclick="regarder('+o.id+',\''+type+'\')">'+
      I.play+' Regarder</button>';
  } else if(st === 'demande'){
    principal = '<button class="btn attente" onclick="menuDemande('+o.id+',\''+type+'\')">'+
      I.horloge+' Demandé</button>';
  } else if(st === 'encours'){
    principal = '<button class="btn attente" onclick="menuDemande('+o.id+',\''+type+'\')">'+
      I.horloge+' En cours…</button>';
  } else if(st === 'refuse'){
    principal = '<button class="btn ghost" onclick="menuDemande('+o.id+',\''+type+'\')">'+
      'Demande refusée</button>';
  } else {
    principal = '<button class="btn" onclick="demander('+ref+',\''+type+'\');render()">'+
      I.envoi+' Demander sur Cinéflix</button>';
  }

  return '<div class="actions">'+principal+coeur+'</div>';
}

/* Le bouton « Demander » a besoin de l'objet complet pour retenir titre et
   affiche : on le relit depuis l'état plutôt que de le sérialiser dans le HTML,
   où une apostrophe dans un titre suffirait à tout casser. */
function ficheObjet(){ return (ui.fiche && ui.fiche.data) || {}; }

function ouvrirJellyfin(titre, jf){
  const base = jellyBase || (db.jellyfin||'').replace(/\/+$/,'');
  if(!base){
    return openSheet('<h3>Serveur non renseigné</h3>'+
      '<p class="small muted" style="margin:0 0 8px">Indique l\'adresse de Cinéflix dans '+
      'les réglages pour ouvrir les titres directement dans Jellyfin.</p>'+
      '<button class="opt" onclick="closeSheet();go(\'reglages\',{from:\'profil\'})">Ouvrir les réglages</button>'+
      '<button class="opt" onclick="closeSheet()">Annuler</button>');
  }
  /* Avec l'identifiant Jellyfin (fourni par le NAS depuis la v2907v), on
     atterrit sur LA fiche du serveur — plus de détour par la recherche. Le
     lancement direct de la lecture, lui, restera hors de portée tant que le
     serveur est en HTTP simple : l'app est servie en HTTPS et le navigateur
     interdit d'appeler l'API en clair (contenu mixte). Le jour où
     « tailscale serve » posera du HTTPS, un vrai lecteur intégré deviendra
     possible. */
  if(jf){
    window.open(base + '/web/#/details?id=' + encodeURIComponent(jf), '_blank', 'noopener');
    return;
  }
  window.open(base + '/web/#/search.html?query=' + encodeURIComponent(titre||''), '_blank', 'noopener');
}
function regarder(id, type){
  const o = ficheObjet();
  const f = typeof ficheDe === 'function' ? ficheDe(type, id) : null;
  ouvrirJellyfin(o.title || o.name || '', (f && f.jf) || '');
}

function menuDemande(id, type){
  const it = item(type, id);
  const st = it && it.req ? it.req.statut : null;
  openSheet('<h3>'+(st === 'encours' ? 'Demande en cours de traitement' : 'Demande envoyée')+'</h3>'+
    '<p class="small muted" style="margin:0 0 8px">'+
      (st === 'encours'
        ? 'Le titre est en cours d\'ajout sur Cinéflix. Il basculera tout seul en « Regarder » dès qu\'il sera là.'
        : 'Elle apparaît dans la file de demandes. Tu seras prévenu quand le titre arrivera.')+'</p>'+
    /* Attention à l'ordre : annulerDemande(type, id) — il a déjà été inversé
       ici, et la fonction ne trouvait alors jamais la demande à annuler. */
    '<button class="opt danger" onclick="closeSheet();annulerDemande(\''+type+'\','+id+');render()">'+
      'Annuler ma demande</button>'+
    '<button class="opt" onclick="closeSheet()">Fermer</button>');
}

/* ---------- Où regarder (JustWatch via TMDB) ---------- */
function blocPlateformes(o){
  const p = ((o['watch/providers']||{}).results||{})[db.region||'FR'];
  if(!p) return '';
  let abo = p.flatrate || [];
  if(!abo.length) return '';

  /* Ne pas répéter ce que les boutons d'action montrent déjà. Deux doublons
     à écarter, et le second n'est pas évident : TMDB liste les déclinaisons
     d'un même service comme des fournisseurs distincts — « Netflix » ET
     « Netflix Standard with Ads », « Canal+ » ET « Canal+ Ciné Séries ».
     Sur Carry-On, la section affichait donc Netflix deux fois de suite
     (signalé par Alexandre le 06/08). On filtre sur le NOM, pas seulement
     sur l'identifiant, pour attraper aussi les déclinaisons.
     Ce qui reste — HBO Max, chaînes tierces — garde tout son intérêt :
     c'est justement ce que les quatre boutons ne disent pas. */
  const enBoutons = statut(params.type, o.id) !== 'obtenu' ? platsDuTitre(o) : [];
  if(enBoutons.length){
    abo = abo.filter(f => !enBoutons.some(pf =>
      f.provider_id === pf.id ||
      (f.provider_name||'').toLowerCase().indexOf(pf.nom.toLowerCase()) >= 0));
    if(!abo.length) return '';
  }

  return '<div class="sectitle">Aussi en streaming</div><div class="plats">'+
    abo.map(f=>'<div class="plato">'+
      (f.logo_path ? '<img loading="lazy" src="'+IMG(f.logo_path,'w92')+'" alt="">' : '')+
      '<span>'+esc(f.provider_name||'')+'</span></div>').join('')+'</div>'+
    '<div class="credit">Disponibilité fournie par JustWatch'+
      (p.link ? ' · <a href="'+esc(p.link)+'" target="_blank" rel="noopener">toutes les offres</a>' : '')+'</div>';
}

/* ---------- Bande-annonce ----------
   TMDB renvoie souvent une dizaine de vidéos : teasers, extraits, featurettes,
   parfois plusieurs bandes-annonces. On en choisit une seule, la plus utile
   pour décider si on veut le titre : d'abord la VERSION ORIGINALE — une BA se
   regarde en VO, sous-titrée si besoin (pour un film français, la VO est la
   VF) — puis une VF, puis une anglaise ; ensuite une vraie bande-annonce
   plutôt qu'un teaser, puis une officielle. */
function meilleureVideo(videos, vo){
  const yt = ((videos||{}).results||[]).filter(v => v && v.site === 'YouTube' && v.key);
  if(!yt.length) return null;
  const rangLangue = l => l === vo ? 0 : l === 'fr' ? 1 : l === 'en' ? 2 : 3;
  const rangType   = t => t === 'Trailer' ? 0 : t === 'Teaser' ? 1 : 2;
  return yt.slice().sort((a,b)=>
    rangLangue(a.iso_639_1) - rangLangue(b.iso_639_1) ||
    rangType(a.type)        - rangType(b.type)        ||
    (a.official?0:1)        - (b.official?0:1)        ||
    (b.size||0)             - (a.size||0)
  )[0];
}

/* On n'insère l'iframe YouTube qu'au clic : une vignette TMDB coûte une image,
   un lecteur embarqué coûte plusieurs centaines de kilo-octets et des cookies
   tiers sur chaque fiche ouverte. */
function blocBandeAnnonce(d){
  const v = meilleureVideo(d.videos, d.original_language);
  if(!v) return '';
  const cle = String(v.key).replace(/[^\w-]/g,'');
  if(!cle) return '';
  const img = IMG(d.backdrop_path,'w780') || IMG(d.poster_path,'w780');
  /* Une BA qui n'est pas en français est étiquetée VOST : au clic, on
     demandera à YouTube d'afficher les sous-titres français (voir jouerBA). */
  const vf  = v.iso_639_1 === 'fr';
  return '<div class="sectitle">Bande-annonce</div>'+
    '<div class="wrap" style="padding-top:0">'+
      '<div class="ba" role="button" tabindex="0" aria-label="Lire la bande-annonce" '+
           'onclick="jouerBA(this,\''+cle+'\','+(vf?0:1)+')" '+
           'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();jouerBA(this,\''+cle+'\','+(vf?0:1)+')}">'+
        (img ? '<img loading="lazy" src="'+img+'" alt="">' : '')+
        '<span class="baplay">'+I.play+'</span>'+
        '<span class="balbl">'+(vf ? 'VF' : 'VOST FR')+' · '+esc(v.name || 'Bande-annonce')+'</span>'+
      '</div>'+
    '</div>';
}

function jouerBA(el, cle, st){
  if(el.dataset.on) return;
  el.dataset.on = '1';
  el.removeAttribute('role'); el.removeAttribute('tabindex');
  /* st : la BA n'est pas en français — cc_load_policy=1 affiche les
     sous-titres d'office, cc_lang_pref=fr les demande en français. YouTube ne
     peut afficher que les sous-titres que la chaîne a fournis ; sur les
     bandes-annonces officielles, c'est presque toujours le cas. */
  el.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/'+cle+
    '?autoplay=1&rel=0&playsinline=1'+
    (st ? '&cc_load_policy=1&cc_lang_pref=fr&hl=fr' : '')+
    '" title="Bande-annonce" loading="lazy" '+
    'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" '+
    'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
}

/* Réalisation en tête, puis le casting — et chaque personne est cliquable :
   sa fiche liste tout ce qu'elle a fait. */
function blocCasting(credits){
  const real = ((credits||{}).crew||[]).filter(p => p.job === 'Director').slice(0,2)
    .map(p => Object.assign({}, p, { character:'Réalisation' }));
  const cast = real.concat(((credits||{}).cast||[]).slice(0,12));
  if(!cast.length) return '';
  return '<div class="sectitle">Réalisation & casting</div><div class="cast">'+cast.map(p=>
    '<button class="cperson" onclick="ouvrirPersonne('+p.id+')">'+
      (p.profile_path ? '<img loading="lazy" src="'+IMG(p.profile_path,'w185')+'" alt="">'
                      : '<div class="ph2">'+esc((p.name||'?')[0])+'</div>')+
      '<div class="cname">'+esc(p.name)+'</div>'+
      '<div class="crole">'+esc(p.character||'')+'</div>'+
    '</button>').join('')+'</div>';
}

/* ============================ Saisons et épisodes ============================ */
/* La liste des saisons arrive avec la fiche de la série : la rangée ne coûte
   aucune requête. Le détail d'une saison (les épisodes) n'est demandé qu'au
   moment où on l'ouvre. */
function blocSaisons(d){
  const l = (d.seasons||[]).filter(s => s && (s.episode_count||0) > 0);
  if(!l.length) return '';
  /* TMDB range les « Spéciaux » en saison 0 et les met en tête : on les
     renvoie à la fin, on veut voir la saison 1 en premier. */
  const rang = s => s.season_number === 0 ? 9999 : s.season_number;
  l.sort((a,b) => rang(a) - rang(b));
  return '<div class="sectitle">Saisons <span class="cnt">'+l.length+'</span></div>'+
    '<div class="grid rangee">'+ l.map(s =>
      '<button class="gcard" onclick="ouvrirSaison('+d.id+','+s.season_number+')">'+
        '<div class="wrapimg">'+posterEl(s.poster_path,'w342','',s.name||'')+'</div>'+
        '<div class="gname">'+esc(s.name || ('Saison '+s.season_number))+'</div>'+
        '<div class="gyear">'+s.episode_count+' épisode'+(s.episode_count > 1 ? 's' : '')+
          (s.air_date ? ' · '+esc(year(s.air_date)) : '')+'</div>'+
      '</button>').join('') +'</div>';
}

function ouvrirSaison(tvId, n){
  oublierDefil('saison');
  const d = ficheObjet();
  /* Comme pour les personnes : d'où l'on vient est rangé dans l'état de la
     saison, pas dans les paramètres de navigation qui se vident. */
  const nav = view === 'fiche'
    ? { fid:params.id, ftype:params.type, ffrom:params.from }
    : { ffrom:view };
  ui.saison = { tv:tvId, n:n, serie:(d.name || d.title || ''), loading:true, data:null, nav:nav };
  go('saison', { id:tvId, n:n });
  chargerSaison();
}

async function chargerSaison(){
  const st = ui.saison || {};
  const tv = st.tv, n = st.n;
  const memeSaison = ()=> ui.saison && ui.saison.tv === tv && ui.saison.n === n;
  if(!memeSaison()) return;
  ui.saison = Object.assign({}, st, { loading:true, error:'' });
  try{
    const d = await tmdb('/tv/'+tv+'/season/'+n);
    if(!memeSaison()) return;
    ui.saison = Object.assign({}, ui.saison, { loading:false, data:d });
  }catch(e){
    if(!memeSaison()) return;
    ui.saison = Object.assign({}, ui.saison, { loading:false,
      error: e.message === 'BADKEY' ? 'Clé TMDB refusée' : 'Impossible de charger la saison' });
  }
  if(view === 'saison') render();
}

function viewSaison(){
  const st = ui.saison || {};
  const back = 'goBack()';
  const nom = st.serie || 'Série';
  if(st.loading) return header(nom, {back:back})+
    '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement des épisodes…</p></div>';
  if(st.error || !st.data) return header(nom, {back:back})+
    '<div class="empty"><h3>Oups</h3><p>'+esc(st.error || 'Saison introuvable')+'</p>'+
    '<button class="btn ghost" onclick="chargerSaison()">Réessayer</button></div>';

  const d = st.data;
  const eps = d.episodes || [];
  const titreSaison = d.name || ('Saison '+st.n);
  let h = header(nom, {back:back});
  h += '<div class="dhead">'+
    '<div style="width:92px;flex:none">'+posterEl(d.poster_path,'w342','',titreSaison)+'</div>'+
    '<div class="dmeta"><h2>'+esc(titreSaison)+'</h2>'+
      '<div class="small muted">'+esc(nom)+
        (d.air_date ? ' · '+esc(year(d.air_date)) : '')+
        ' · '+eps.length+' épisode'+(eps.length > 1 ? 's' : '')+
        (surCineflix('tv', st.tv) ? ' · <span class="badge live">Sur Cinéflix</span>' : '')+'</div>'+
    '</div></div>';
  if(surCineflix('tv', st.tv))
    h += '<div class="actions"><button class="btn vert" onclick="ouvrirJellyfin('+
      JSON.stringify(nom).replace(/"/g,'&quot;')+','+
      JSON.stringify((ficheDe('tv', st.tv)||{}).jf || '').replace(/"/g,'&quot;')+
      ')">'+I.play+' Regarder sur Cinéflix</button></div>';
  if(d.overview)
    h += '<div class="overview clamp" onclick="this.classList.toggle(\'clamp\')">'+esc(d.overview)+'</div>';

  h += '<div class="sectitle">Épisodes <span class="cnt">'+eps.length+'</span></div>'+
    (eps.length
      ? '<div class="eps">'+ eps.map(e =>
          '<div class="ep">'+
            '<div class="epimg">'+(e.still_path
              ? '<img loading="lazy" src="'+IMG(e.still_path,'w300')+'" alt="">'
              : '<span>'+(e.episode_number||'?')+'</span>')+'</div>'+
            '<div>'+
              '<div class="epnum">Épisode '+(e.episode_number||'?')+
                (e.air_date ? ' · '+esc(fmtDateCourt(e.air_date))+' '+esc(year(e.air_date)) : '')+
                (e.runtime ? ' · '+esc(fmtDuree(e.runtime)) : '')+'</div>'+
              '<div class="eptitre">'+esc(e.name||'')+'</div>'+
              (e.overview
                ? '<div class="epres clamp" onclick="this.classList.toggle(\'clamp\')">'+esc(e.overview)+'</div>'
                : '')+
            '</div>'+
          '</div>').join('') +'</div>'
      : '<div class="empty"><p>Aucun épisode renseigné pour cette saison.</p></div>');
  return h + '<div style="height:32px"></div>';
}

/* ============================ À voir ensuite ============================ */
/* Deux sources : les recommandations de TMDB (livrées avec la fiche) et
   l'œuvre des têtes d'affiche (un appel par acteur, en tâche de fond). */
function blocReco(d, type){
  const vus = {};
  const l = ((d.recommendations||{}).results||[])
    .concat(((d.similar||{}).results||[]))
    .filter(w => {
      if(!w || !w.id || w.id === d.id || !w.poster_path || vus[w.id]) return false;
      vus[w.id] = 1; return true;
    }).slice(0,20);
  if(!l.length) return '';
  return '<div class="sectitle">Dans le même esprit</div>'+
    '<div class="grid rangee">'+ l.map(w => carteTitre(w, type)).join('') +'</div>';
}

function htmlAvecActeurs(){
  const av = (ui.fiche||{}).avec || [];
  return av.filter(a => a.l && a.l.length).map(a =>
    '<div class="sectitle"><button class="secbtn" onclick="ouvrirPersonne('+a.id+')">'+
      'Avec '+esc(a.nom)+'</button></div>'+
    '<div class="grid rangee">'+ a.l.map(w => carteTitre(w, a.type)).join('') +'</div>').join('');
}

/* Un acteur consulté est gardé le temps de la session : passer d'un film à
   l'autre du même acteur ne recharge rien. */
const cacheActeur = {};
async function chargerAvecActeurs(){
  const st = ui.fiche || {};
  const d = st.data;
  if(!d || st.avec) return;
  const type = st.type, id = st.id;
  const vedettes = (((d.credits||{}).cast) || []).slice(0,2).filter(p => p && p.id);
  if(!vedettes.length) return;
  const res = [];
  for(const p of vedettes){
    let l = cacheActeur[p.id];
    if(!l){
      try{
        const c = await tmdb('/person/'+p.id+'/combined_credits');
        l = (c.cast||[]).filter(w => w && w.media_type === type && w.poster_path)
          .sort((a,b) => (b.popularity||0) - (a.popularity||0));
        cacheActeur[p.id] = l;
      }catch(e){ l = []; }
    }
    res.push({ id:p.id, nom:p.name||'', type:type, l: l.filter(w => w.id !== d.id).slice(0,20) });
  }
  if(!ui.fiche || ui.fiche.id !== id) return;      // l'utilisateur a changé de fiche
  ui.fiche.avec = res;
  const el = document.getElementById('fsug');
  /* On ne redessine pas toute la fiche : une bande-annonce déjà lancée
     continuerait de jouer, et la position de lecture est préservée. */
  if(view === 'fiche' && el) el.innerHTML = htmlAvecActeurs();
}

/* ============================ Fiche d'une personne ============================ */
function ouvrirPersonne(pid){
  /* Nouvelle personne = on repart du haut. Revenir sur la MÊME fiche via le
     bouton retour ne passe pas par ici : le défilement mémorisé est gardé. */
  oublierDefil('personne');
  /* D'où vient-on ? Rangé dans l'état de la personne (pas dans les paramètres
     de navigation, qui se vident au premier aller-retour) : le bouton retour
     rouvre la fiche d'origine même après un détour par un film. */
  const nav = view === 'fiche'
    ? { fid:params.id, ftype:params.type, ffrom:params.from }
    : { ffrom:view };
  ui.personne = { id:pid, loading:true, data:null, nav:nav };
  go('personne', { id:pid });
  chargerPersonne();
}

async function chargerPersonne(){
  const id = (ui.personne||{}).id, nav = (ui.personne||{}).nav;
  try{
    const d = await tmdb('/person/'+id, { append_to_response:'combined_credits' });
    if(!ui.personne || ui.personne.id !== id) return;
    ui.personne = { id:id, loading:false, data:d, nav:nav };
  }catch(e){
    if(!ui.personne || ui.personne.id !== id) return;
    ui.personne = { id:id, loading:false, nav:nav,
      error: e.message === 'BADKEY' ? 'Clé TMDB refusée' : 'Impossible de charger la fiche' };
  }
  if(view === 'personne') render();
}

/* Toute l'œuvre d'une personne : devant et derrière la caméra, sans doublon,
   du plus récent au plus ancien. */
function filmographie(d){
  const cc = d.combined_credits || {};
  const vus = {}, l = [];
  (cc.cast||[]).concat(cc.crew||[]).forEach(w=>{
    if(!w || (w.media_type !== 'movie' && w.media_type !== 'tv')) return;
    const k = w.media_type+':'+w.id;
    if(vus[k]) return;
    vus[k] = 1; l.push(w);
  });
  l.sort((a,b)=> String(b.release_date||b.first_air_date||'')
    .localeCompare(String(a.release_date||a.first_air_date||'')));
  return l;
}

function viewPersonne(){
  const st = ui.personne || {};
  const back = 'goBack()';
  if(st.loading) return header('Chargement…',{back:back})+
    '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement…</p></div>';
  if(st.error || !st.data) return header('Erreur',{back:back})+
    '<div class="empty"><h3>Oups</h3><p>'+esc(st.error||'Fiche introuvable')+'</p></div>';

  const d = st.data;
  const jobs = { Acting:'Acteur / actrice', Directing:'Réalisation',
                 Writing:'Scénario', Production:'Production' };
  const l = filmographie(d);
  let h = header(d.name||'', {back:back});
  h += '<div class="dhead" style="margin-top:16px">'+
    '<div style="width:92px;flex:none">'+
      (d.profile_path ? '<img class="poster" src="'+IMG(d.profile_path,'w342')+'" alt="">'
                      : '<div class="poster ph">'+esc((d.name||'?')[0])+'</div>')+'</div>'+
    '<div class="dmeta"><h2>'+esc(d.name||'')+'</h2>'+
      '<div class="small muted">'+esc(jobs[d.known_for_department] || d.known_for_department || '')+
        (d.birthday ? ' · '+esc(String(d.birthday).slice(0,4)) : '')+
        (d.deathday ? ' – '+esc(String(d.deathday).slice(0,4)) : '')+'</div>'+
    '</div></div>';
  if(d.biography)
    h += '<div class="sectitle">Biographie</div>'+
      '<div class="overview clamp" style="margin-top:0" onclick="this.classList.toggle(\'clamp\')">'+
      esc(d.biography)+'</div>';
  /* La grille réutilise les cartes de Découvrir : la coche verte « déjà sur
     Cinéflix » et les statuts de demande viennent avec, gratuitement. */
  h += '<div class="sectitle">Filmographie <span class="cnt">'+l.length+'</span></div>'+
    '<div class="grid">'+ l.map(w=>carteTitre(w, w.media_type)).join('') +'</div>';
  return h + '<div style="height:32px"></div>';
}

/* ---------- La vue ---------- */
function viewFiche(){
  const st = ui.fiche || {};
  const back = 'goBack()';
  if(st.loading) return header('Chargement…',{back:back})+
    '<div class="empty"><span class="spin"></span><p style="margin-top:12px">Chargement de la fiche…</p></div>';
  if(st.error) return header('Erreur',{back:back})+
    '<div class="empty"><h3>Oups</h3><p>'+esc(st.error)+'</p>'+
    '<button class="btn ghost" onclick="chargerFiche()">Réessayer</button></div>';
  if(!st.data) return header('',{back:back});

  const d = st.data, type = st.type, isTv = type === 'tv';
  const titre = isTv ? (d.name||'') : (d.title||'');
  const date  = isTv ? d.first_air_date : d.release_date;
  const note  = d.vote_average ? Math.round(d.vote_average*10)/10 : null;
  const dispo = surCineflix(type, d.id);

  let html = header(titre, {back:back});
  html += '<div class="hero">'+(d.backdrop_path?'<img src="'+IMG(d.backdrop_path,'w780')+'" alt="">':'')+'</div>';
  html += '<div class="dhead">'+
    '<div style="width:92px;flex:none">'+posterEl(d.poster_path,'w342','',titre)+'</div>'+
    '<div class="dmeta">'+
      '<h2>'+esc(titre)+'</h2>'+
      '<div class="small muted">'+esc(year(date))+
        (isTv && d.networks && d.networks[0] ? ' · '+esc(d.networks[0].name) : '')+
        (!isTv && d.runtime ? ' · '+fmtDuree(d.runtime) : '')+
        (dispo ? ' · <span class="badge live">Sur Cinéflix</span>' : '')+'</div>'+
      (note ? '<div style="margin-top:6px"><span class="note">'+I.star+note+'</span>'+
        '<span class="tiny muted" style="margin-left:6px">'+(d.vote_count||0)+' votes</span></div>' : '')+
      (function(){ const n = noteDe(type, d.id, titre, date);
        return n && n.jt ? '<div style="margin-top:6px">'+tlrHtml(n)+'</div>' : ''; })()+
      '<div class="small muted" style="margin-top:6px">'+
        esc((d.genres||[]).map(g=>g.name).slice(0,3).join(' · '))+'</div>'+
    '</div></div>';

  html += actionsFiche(d, type);

  if(!isTv) html += blocSorties(st.dates);
  else {
    html += '<div class="stats">'+
      '<div class="stat"><b>'+(d.number_of_seasons||'?')+'</b><span>saison'+
        ((d.number_of_seasons||0)>1?'s':'')+'</span></div>'+
      '<div class="stat"><b>'+(d.number_of_episodes||'?')+'</b><span>épisodes</span></div>'+
      '<div class="stat"><b>'+esc(d.status==='Ended'?'Terminée':d.status==='Canceled'?'Annulée':'En cours')+
        '</b><span>statut</span></div>'+
    '</div>';
    if(d.next_episode_to_air && d.next_episode_to_air.air_date){
      const n = d.next_episode_to_air;
      html += '<div class="wrap" style="padding-top:0"><div class="card" style="padding:14px;text-align:center">'+
        '<div class="small muted">Prochain épisode</div>'+
        '<div style="font-weight:700;margin-top:2px">S'+n.season_number+'E'+n.episode_number+
          ' · '+esc(n.name||'')+'</div>'+
        '<div class="small" style="color:var(--accent);margin-top:2px">'+fmtDate(n.air_date)+
          ' · '+esc(relatif(n.air_date))+'</div></div></div>';
    }
  }

  if(d.overview)
    html += '<div class="sectitle">Synopsis</div>'+
      '<div class="overview clamp" style="margin-top:0" onclick="this.classList.toggle(\'clamp\')">'+
      esc(d.overview)+'</div>';

  if(isTv) html += blocSaisons(d);
  html += blocBandeAnnonce(d);
  html += blocPlateformes(d);
  html += blocCasting(d.credits);
  html += blocReco(d, type);
  /* Rempli par chargerAvecActeurs() — et rerempli ici quand la fiche est
     redessinée (après une demande, par exemple). */
  html += '<div id="fsug">'+htmlAvecActeurs()+'</div>';
  return html + '<div style="height:32px"></div>';
}
