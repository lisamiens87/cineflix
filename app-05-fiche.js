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
    const extra = type === 'movie' ? 'credits,release_dates,watch/providers,videos'
                                   : 'credits,watch/providers,videos';
    /* include_video_language : sans lui, TMDB ne renvoie que les vidéos dans la
       langue demandée, et la plupart des titres n'ont pas de bande-annonce VF.
       On demande donc fr, en, et celles sans langue déclarée. */
    const d = await tmdb('/'+type+'/'+id, { append_to_response: extra,
                                            include_video_language: 'fr,en,null' });
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
  return '<div class="sectitle">Quand peut-on le voir</div><div class="sorties">'+corps+'</div>'+src;
}

/* ---------- Boutons d'action ---------- */
/* Les plateformes (parmi les quatre retenues) qui proposent ce titre par
   abonnement en France, d'après TMDB/JustWatch. */
function platsDuTitre(o){
  const p = ((o['watch/providers']||{}).results||{})[db.region||'FR'];
  const abo = (p && p.flatrate) || [];
  return PLATEFORMES.filter(pf => abo.some(f => f.provider_id === pf.id ||
    (f.provider_name||'').toLowerCase().indexOf(pf.nom.toLowerCase()) === 0));
}
function ouvrirPlateforme(id){
  const pf = PLATEFORMES.find(p=>p.id===id);
  if(!pf) return;
  const o = ficheObjet();
  window.open(pf.lien(o.title || o.name || ''), '_blank', 'noopener');
}

/* Un seul bouton principal, qui dit exactement où on en est :
   Demander → Demandé → En cours → Regarder. Exception : quand la fiche est
   ouverte depuis la vue « Plateformes », demander n'a pas de sens — le titre
   se regarde là-bas. On affiche à la place le bouton de chaque plateforme
   qui le propose. */
function actionsFiche(o, type){
  const st = statut(type, o.id);
  const it = item(type, o.id);
  const fav = !!(it && it.fav);
  const ref = 'ficheObjet()';

  if(ui.presence === 'plats' && st !== 'obtenu'){
    const dispo = platsDuTitre(o);
    if(dispo.length){
      const boutons = dispo.map(pf =>
        '<button class="btn plat" onclick="ouvrirPlateforme('+pf.id+')">'+esc(pf.nom)+'</button>').join('');
      const coeurP = '<button class="btn ghost" style="flex:0 0 54px'+(fav?';color:var(--accent)':'')+
        '" onclick="basculerFavori('+ref+',\''+type+'\');render()" aria-label="Favori">'+
        (fav ? I.coeurPlein : I.coeur)+'</button>';
      return '<div class="actions plats">'+boutons+coeurP+'</div>';
    }
    /* Aucune des quatre ne l'a (cas limite) : on retombe sur le bouton normal. */
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

  const coeur = '<button class="btn ghost" style="flex:0 0 54px'+(fav?';color:var(--accent)':'')+
    '" onclick="basculerFavori('+ref+',\''+type+'\');render()" aria-label="Favori">'+
    (fav ? I.coeurPlein : I.coeur)+'</button>';

  return '<div class="actions">'+principal+coeur+'</div>';
}

/* Le bouton « Demander » a besoin de l'objet complet pour retenir titre et
   affiche : on le relit depuis l'état plutôt que de le sérialiser dans le HTML,
   où une apostrophe dans un titre suffirait à tout casser. */
function ficheObjet(){ return (ui.fiche && ui.fiche.data) || {}; }

function regarder(id, type){
  const base = jellyBase || (db.jellyfin||'').replace(/\/+$/,'');
  if(!base){
    return openSheet('<h3>Serveur non renseigné</h3>'+
      '<p class="small muted" style="margin:0 0 8px">Indique l\'adresse de Cinéflix dans '+
      'les réglages pour ouvrir les titres directement dans Jellyfin.</p>'+
      '<button class="opt" onclick="closeSheet();go(\'reglages\',{from:\'profil\'})">Ouvrir les réglages</button>'+
      '<button class="opt" onclick="closeSheet()">Annuler</button>');
  }
  /* Jellyfin n'expose pas de lien par identifiant TMDB : on ouvre la recherche
     du serveur sur le titre, ce qui tombe juste dans l'immense majorité des cas. */
  const o = ficheObjet();
  const titre = o.title || o.name || '';
  window.open(base + '/web/#/search.html?query=' + encodeURIComponent(titre), '_blank', 'noopener');
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
  /* Sur la vue Plateformes, l'information est déjà dans les boutons
     d'action : répéter « Aussi en streaming » ferait doublon. */
  if(ui.presence === 'plats') return '';
  const p = ((o['watch/providers']||{}).results||{})[db.region||'FR'];
  if(!p) return '';
  const abo = p.flatrate || [];
  if(!abo.length) return '';
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
   pour décider si on veut le titre : d'abord une VF, puis une vraie
   bande-annonce plutôt qu'un teaser, puis une officielle. */
function meilleureVideo(videos){
  const yt = ((videos||{}).results||[]).filter(v => v && v.site === 'YouTube' && v.key);
  if(!yt.length) return null;
  const rangLangue = l => l === 'fr' ? 0 : l === 'en' ? 1 : 2;
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
  const v = meilleureVideo(d.videos);
  if(!v) return '';
  const cle = String(v.key).replace(/[^\w-]/g,'');
  if(!cle) return '';
  const img = IMG(d.backdrop_path,'w780') || IMG(d.poster_path,'w780');
  const vf  = v.iso_639_1 === 'fr';
  return '<div class="sectitle">Bande-annonce</div>'+
    '<div class="wrap" style="padding-top:0">'+
      '<div class="ba" role="button" tabindex="0" aria-label="Lire la bande-annonce" '+
           'onclick="jouerBA(this,\''+cle+'\')" '+
           'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();jouerBA(this,\''+cle+'\')}">'+
        (img ? '<img loading="lazy" src="'+img+'" alt="">' : '')+
        '<span class="baplay">'+I.play+'</span>'+
        '<span class="balbl">'+(vf ? 'VF' : 'VO')+' · '+esc(v.name || 'Bande-annonce')+'</span>'+
      '</div>'+
    '</div>';
}

function jouerBA(el, cle){
  if(el.dataset.on) return;
  el.dataset.on = '1';
  el.removeAttribute('role'); el.removeAttribute('tabindex');
  el.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/'+cle+
    '?autoplay=1&rel=0&playsinline=1" title="Bande-annonce" loading="lazy" '+
    'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" '+
    'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
}

function blocCasting(credits){
  const cast = ((credits||{}).cast||[]).slice(0,12);
  if(!cast.length) return '';
  return '<div class="sectitle">Casting</div><div class="cast">'+cast.map(p=>
    '<div class="cperson">'+
      (p.profile_path ? '<img loading="lazy" src="'+IMG(p.profile_path,'w185')+'" alt="">'
                      : '<div class="ph2">'+esc((p.name||'?')[0])+'</div>')+
      '<div class="cname">'+esc(p.name)+'</div>'+
      '<div class="crole">'+esc(p.character||'')+'</div>'+
    '</div>').join('')+'</div>';
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

  html += blocBandeAnnonce(d);
  html += blocPlateformes(d);
  html += blocCasting(d.credits);
  return html + '<div style="height:32px"></div>';
}
