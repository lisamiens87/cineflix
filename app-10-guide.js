"use strict";
/* ============================ Laisse-moi te guider ============================
   Un moteur entièrement local : aucune clé nouvelle, aucun coût, aucune
   dépendance. Deux entrées — les goûts déclarés à l'inscription, et l'humeur
   du moment — mais un seul périmètre, qui est la règle d'or de cet écran :

     on ne propose que ce que cette personne peut regarder CE SOIR,
     c'est-à-dire la bibliothèque du serveur et les plateformes
     auxquelles ELLE est abonnée.

   Proposer un chef-d'œuvre qu'on ne peut pas lancer, c'est une frustration,
   pas une suggestion. */

const gNorm = s => String(s||'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const gLettres = s => String(s||'').toLowerCase().normalize('NFD').replace(/[^a-z]/g,'');

/* ---------- Les dix humeurs ----------
   Chacune porte ses genres, ses exclusions, ses seuils ET ses mots
   déclencheurs : c'est la même table qui sert aux puces et à la
   compréhension du texte libre. Les mots sont écrits sans accent, puisque
   c'est sous cette forme que le texte de l'utilisateur arrive. */
const HUMEURS = [
  { id:'rire', label:'Rire un bon coup', emo:'😄',
    mots:['rire','rigoler','marrer','marrant','comedie','comique','drole','leger',
          'detendre','decompresser','prise de tete','prendre la tete','fun','bonne humeur'],
    genres:[35], sans:[27,10752], duree:115, note:6.2 },
  { id:'action', label:'Action, sans réfléchir', emo:'💥',
    mots:['action','castagne','explosion','bagarre','sans reflechir','sans se poser',
          'poser de questions','adrenaline','spectaculaire','baston','pop corn'],
    genres:[28,12], sans:[99], apres:2000, note:6 },
  { id:'peur', label:'Me faire peur', emo:'😱',
    mots:['peur','horreur','flipper','angoisse','effrayant','frissons','epouvante',
          'terrifiant','cauchemar'],
    genres:[27,53], sans:[35,10751], note:6 },
  { id:'pleurer', label:'Pleurer un bon coup', emo:'😢',
    mots:['pleurer','emouvoir','emouvant','triste','larmes','bouleversant','melo',
          'toucher','emotion'],
    genres:[18,10749], sans:[27], note:7.2 },
  { id:'reflechir', label:'Réfléchir', emo:'🧠',
    mots:['reflechir','intelligent','cerveau','complexe','intello','philosophique',
          'profond','tordu','qui fait penser','prise de tete positive'],
    genres:[18,878,9648], sans:[10751], note:7.3 },
  { id:'famille', label:'En famille', emo:'👨‍👩‍👧',
    mots:['famille','enfants','gamins','petits','tous ensemble','avec les enfants',
          'dessin anime','animation'],
    genres:[16,10751,12], sans:[27,53,80], note:6.5 },
  { id:'beau', label:'Beau et lent', emo:'🎞️',
    mots:['contemplatif','lent','esthetique','magnifique','poetique','beau film',
          'grand film','du grand cinema'],
    genres:[18,36], sans:[27,28], note:7.4 },
  { id:'suspense', label:'Suspense', emo:'🔎',
    mots:['suspense','enquete','polar','thriller','mystere','intrigue','tension',
          'policier','crime','haletant'],
    genres:[53,80,9648], sans:[10751], note:6.8 },
  { id:'voyager', label:'Voyager', emo:'🌍',
    mots:['voyager','voyage','depaysement','ailleurs','decouvrir','aventure','nature',
          'evasion','documentaire'],
    genres:[12,99,36], sans:[27], note:6.5 },
  { id:'sure', label:'Une valeur sûre', emo:'⭐',
    mots:['valeur sure','incontournable','le meilleur','chef d oeuvre',
          'reference','culte','pas me tromper'],
    genres:[], sans:[], note:7.8, votes:2000 }
];

/* Des nuances qui s'appliquent PAR-DESSUS n'importe quelle humeur : elles ne
   changent pas le genre, elles resserrent la sélection. */
const MODIFS = [
  { id:'court',  mots:['court','pas long','pas trop long','moins de deux heures','moins de 2h','rapide'],
    dit:'court', appli:r=>{ r.duree = Math.min(r.duree || 999, 110); } },
  { id:'recent', mots:['recent','nouveau','nouveaute','cette annee','qui vient de sortir'],
    dit:'récent', appli:r=>{ r.apres = Math.max(r.apres || 0, 2018); } },
  { id:'vieux',  mots:['vieux','ancien','a l ancienne','annees 80','annees 70','vieux film'],
    dit:'ancien', appli:r=>{ r.avant = 1995; r.apres = 0; } },
  { id:'fr',     mots:['francais','france','french','de chez nous'],
    dit:'français', appli:r=>{ r.pays = 'FR'; } },
  { id:'serie',  mots:['serie','series','saison','episode','a binger'],
    dit:'série', appli:r=>{ r.type = 'tv'; } }
];

/* ---------- Le périmètre ---------- */
const platsProfil = ()=> {
  const g = GOUTS.d || {};
  return Array.isArray(g.plats) ? g.plats.filter(Boolean) : [];
};

/* Un titre venu des recommandations n'est pas forcément regardable : on
   vérifie chez quelles plateformes il est en illimité en France. Une requête
   par titre, mise en cache, et plafonnée — c'est le seul coût réseau
   supplémentaire de cet écran. */
const cacheProv = {};
async function fournisseursFR(type, id){
  const k = type+':'+id;
  if(cacheProv[k]) return cacheProv[k];
  try{
    const d = await tmdb('/'+type+'/'+id+'/watch/providers');
    const fr = ((d.results||{})[db.region||'FR'] || {});
    cacheProv[k] = (fr.flatrate||[]).map(p=>p.provider_id);
  }catch(e){ cacheProv[k] = []; }
  return cacheProv[k];
}

/* ---------- Traduction genres ↔ noms ---------- */
function idsDepuisNoms(noms){
  const l = (noms||[]).map(gLettres);
  return GENRES_FILM.filter(g => {
    const n = gLettres(g.n);
    return l.some(x => x === n || (x.length > 3 && n.indexOf(x) >= 0) ||
                                  (n.length > 3 && x.indexOf(n) >= 0));
  }).map(g=>g.id);
}

/* ---------- Construire la recette ---------- */
function recetteVide(){
  return { genres:[], sans:[], note:0, votes:0, duree:0, apres:0, avant:0,
           pays:'', type:'movie', titre:'', dits:[] };
}
function recetteHumeur(h){
  const r = recetteVide();
  r.genres = (h.genres||[]).slice(); r.sans = (h.sans||[]).slice();
  r.note = h.note || 0; r.votes = h.votes || 0;
  r.duree = h.duree || 0; r.apres = h.apres || 0;
  r.titre = h.label;
  return r;
}
function recetteGouts(){
  const g = GOUTS.d || {};
  const r = recetteVide();
  r.genres = (g.aimes||[]).slice();
  r.sans = (g.fuis||[]).slice();
  r.note = 6.2; r.votes = 200;
  r.duree = g.duree || 0;
  if(g.vieux === false) r.apres = 1990;
  r.titre = 'D\'après tes goûts';
  return r;
}
/* Le texte libre est ramené aux dix recettes : on compte les mots
   déclencheurs de chacune, la mieux servie l'emporte. Si aucune ne répond,
   on ne bluffe pas — on le dit et on retombe sur les goûts. */
function lireHumeur(txt){
  const t = ' '+gNorm(txt)+' ';
  if(!t.trim()) return null;
  let best = null, score = 0;
  HUMEURS.forEach(h=>{
    let n = 0;
    h.mots.forEach(m => { if(t.indexOf(' '+m) >= 0 || t.indexOf(m+' ') >= 0) n++; });
    if(n > score){ score = n; best = h; }
  });
  const mods = MODIFS.filter(m => m.mots.some(x => t.indexOf(x) >= 0));
  if(!best && !mods.length) return null;
  const r = best ? recetteHumeur(best) : recetteGouts();
  mods.forEach(m => { m.appli(r); r.dits.push(m.dit); });
  if(!best) r.titre = 'D\'après tes goûts';
  return r;
}

/* ---------- Les viviers ---------- */
/* 1. La bibliothèque : aucune requête, tout est déjà en mémoire. */
function vivierCineflix(r){
  const t = r.type;
  return (CAT.items||[]).filter(i => i && i.t === t).map(i=>{
    const ids = idsDepuisNoms(i.genres||[]);
    return { type:t, id:i.id, titre:i.nom, poster:'', date:i.sortie,
             annee: Number(String(i.sortie||'').slice(0,4)) || 0,
             note: i.note || 0, duree: i.duree || 0, genres: ids,
             flix:true, plat:null, reco:null, jt: i.jt || 0 };
  }).filter(c=>{
    if(r.genres.length && !r.genres.some(g => c.genres.indexOf(g) >= 0)) return false;
    if(r.sans.length && r.sans.some(g => c.genres.indexOf(g) >= 0)) return false;
    if(r.note && c.note && c.note < r.note - 0.6) return false;   // le NAS note plus sévèrement
    if(r.duree && c.duree && c.duree > r.duree + 10) return false;
    if(r.apres && c.annee && c.annee < r.apres) return false;
    if(r.avant && c.annee && c.annee > r.avant) return false;
    return true;
  });
}

/* 2. Les plateformes du profil : TMDB filtre lui-même. */
async function vivierPlateformes(r, pages){
  const plats = platsProfil();
  if(!plats.length) return [];
  const champ = r.type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const base = {
    include_adult:'false', watch_region: db.region || 'FR',
    with_watch_providers: plats.join('|'), with_watch_monetization_types:'flatrate',
    sort_by:'popularity.desc'
  };
  if(r.genres.length) base.with_genres = r.genres.join('|');
  if(r.sans.length)   base.without_genres = r.sans.join(',');
  if(r.note){ base['vote_average.gte'] = String(r.note);
              base['vote_count.gte'] = String(r.votes || 150); }
  if(r.duree) base['with_runtime.lte'] = String(r.duree);
  if(r.apres) base[champ+'.gte'] = r.apres+'-01-01';
  if(r.avant) base[champ+'.lte'] = r.avant+'-12-31';
  if(r.pays)  base.with_origin_country = r.pays;

  const lots = await Promise.all([1,2,3].slice(0, pages||2).map(p =>
    tmdb('/discover/'+r.type, Object.assign({}, base, {page:String(p)})).catch(()=>({results:[]}))));
  const out = [];
  lots.forEach(d => (d.results||[]).forEach(x=>{
    if(!x.poster_path) return;
    const date = r.type === 'movie' ? x.release_date : x.first_air_date;
    out.push({ type:r.type, id:x.id, titre:(x.title||x.name||''), poster:x.poster_path,
               date:date, annee: Number(String(date||'').slice(0,4)) || 0,
               note: x.vote_average || 0, duree:0, genres:(x.genre_ids||[]),
               flix: surCineflix(r.type, x.id), plat: plats[0], reco:null, jt:0 });
  }));
  return out;
}

/* 3. Les recommandations des trois films adorés — la source la plus fine, et
   la seule à porter une vraie raison (« parce que tu as aimé … »). Elles ne
   respectent pas le périmètre par construction : on les y ramène. */
async function vivierTotems(r){
  const g = GOUTS.d || {};
  const totems = (g.totems||[]).slice(0,3);
  if(!totems.length || r.type !== 'movie') return [];
  const plats = platsProfil();
  const lots = await Promise.all(totems.map(t =>
    tmdb('/movie/'+t.id+'/recommendations', {page:'1'})
      .then(d => ({ src:t.titre, l:(d.results||[]) }))
      .catch(()=>({ src:t.titre, l:[] }))));

  const bruts = [];
  lots.forEach(x => x.l.forEach(y=>{
    if(!y.poster_path) return;
    bruts.push({ type:'movie', id:y.id, titre:y.title||y.name||'', poster:y.poster_path,
                 date:y.release_date, annee:Number(String(y.release_date||'').slice(0,4))||0,
                 note:y.vote_average||0, duree:0, genres:(y.genre_ids||[]),
                 flix: surCineflix('movie', y.id), plat:null, reco:x.src, jt:0 });
  }));

  /* Celles qui sont déjà sur le serveur passent sans vérification. Pour les
     autres, on interroge les fournisseurs — mais pas indéfiniment : vingt
     titres au maximum, sinon l'écran met dix secondes à s'afficher. */
  const dedans = bruts.filter(c => c.flix);
  const aTester = plats.length ? bruts.filter(c => !c.flix).slice(0, 20) : [];
  for(let i = 0; i < aTester.length; i += 5){
    const bout = aTester.slice(i, i+5);
    const rep = await Promise.all(bout.map(c => fournisseursFR('movie', c.id)));
    bout.forEach((c,k)=>{
      const commun = (rep[k]||[]).find(p => plats.indexOf(p) >= 0);
      if(commun){ c.plat = commun; dedans.push(c); }
    });
  }
  return dedans;
}

/* ---------- Le score ---------- */
function scorerCandidat(c, r){
  const g = GOUTS.d || {};
  let s = 0;
  if(c.reco) s += 3;
  let bonus = 0;
  (g.aimes||[]).forEach(id => { if(c.genres.indexOf(id) >= 0) bonus += 2; });
  s += Math.min(4, bonus);
  if(c.flix) s += 2;
  if(c.note >= 7.5) s += 1;
  if(c.jt >= 3) s += 1;
  (g.fuis||[]).forEach(id => { if(c.genres.indexOf(id) >= 0) s -= 6; });
  if(g.duree && c.duree && c.duree > g.duree) s -= 3;
  if(g.vieux === false && c.annee && c.annee < 1990) s -= 2;
  /* La recette du moment pèse aussi : un titre qui coche son genre principal
     doit passer devant un titre simplement bien noté. */
  if(r.genres.length && r.genres.some(id => c.genres.indexOf(id) >= 0)) s += 2;
  return s;
}

function raisonDe(c){
  if(c.reco) return 'Parce que tu as aimé ' + c.reco;
  const bits = [];
  const g1 = c.genres.map(nomGenre).filter(Boolean)[0];
  if(g1) bits.push(g1);
  if(c.annee) bits.push(String(c.annee));
  if(c.flix) bits.push('sur Cinéflix');
  else if(c.plat){
    const p = PLATEFORMES.find(x => x.id === c.plat);
    if(p) bits.push('sur '+p.nom);
  }
  if(c.jt >= 3) bits.push(c.jt+' T Télérama');
  return bits.slice(0,3).join(' · ');
}

/* ---------- L'orchestration ---------- */
let guideSeq = 0;

async function guider(source, txt){
  const g = ui.guide;
  let r = null, repli = false;

  if(source === 'texte'){
    r = lireHumeur(txt);
    if(!r){ r = recetteGouts(); repli = true; }
  }else if(source === 'gouts'){
    r = recetteGouts();
  }else{
    const h = HUMEURS.find(x => x.id === source);
    r = h ? recetteHumeur(h) : recetteGouts();
  }
  /* Les goûts s'appliquent toujours par-dessus l'humeur : ce qu'on fuit reste
     écarté, même quand on a envie de rire. */
  const gt = GOUTS.d || {};
  (gt.fuis||[]).forEach(id => { if(r.sans.indexOf(id) < 0 && r.genres.indexOf(id) < 0) r.sans.push(id); });

  if(repli && !aGouts()){
    g.err = 'Je n\'ai pas saisi, et je ne connais pas encore tes goûts. '+
            'Essaie une des propositions ci-dessus.';
    g.res = []; g.loading = false; g.charge = true; return render();
  }

  const seq = ++guideSeq;
  g.loading = true; g.err = ''; g.recette = r; g.repli = repli; g.source = source;
  render();

  try{
    const [plateformes, totems] = await Promise.all([
      vivierPlateformes(r, 2).catch(()=>[]),
      (source === 'gouts' || repli) ? vivierTotems(r).catch(()=>[]) : Promise.resolve([])
    ]);
    if(seq !== guideSeq) return;

    const cine = vivierCineflix(r);
    const tout = totems.concat(cine, plateformes);

    /* Dédoublonnage : un même titre peut venir des trois viviers. On garde la
       version la plus informée — celle qui porte une raison, ou l'affiche. */
    const par = new Map();
    tout.forEach(c=>{
      const k = c.type+':'+c.id;
      const d = par.get(k);
      if(!d){ par.set(k, c); return; }
      if(!d.reco && c.reco) d.reco = c.reco;
      if(!d.poster && c.poster) d.poster = c.poster;
      if(!d.plat && c.plat) d.plat = c.plat;
      if(c.flix) d.flix = true;
      if(!d.duree && c.duree) d.duree = c.duree;
      if(!d.jt && c.jt) d.jt = c.jt;
      if(!d.genres.length && c.genres.length) d.genres = c.genres;
    });

    let liste = Array.from(par.values()).filter(c=>{
      if(g.vus[c.type+':'+c.id]) return false;             // déjà montré cette session
      const it = item(c.type, c.id);
      if(it && (it.fav || it.req)) return false;           // déjà vu passer, déjà demandé
      return true;
    });

    /* La note Télérama, récupérée après coup : elle pèse dans le score et
       s'affiche dans la raison. */
    liste.forEach(c=>{
      if(c.jt) return;
      const n = noteDe(c.type, c.id, c.titre, c.date);
      if(n && n.jt) c.jt = n.jt;
    });

    liste.forEach(c => { c._s = scorerCandidat(c, r); });
    /* Un léger hasard sur les ex æquo : deux visites de suite ne donnent pas
       exactement la même liste, sans casser l'ordre du score. */
    liste.sort((a,b)=> (b._s - a._s) || (Math.random() - 0.5));
    liste = liste.slice(0, 20);

    /* Les titres venus de la bibliothèque n'ont pas d'affiche : le NAS
       n'envoie que des identifiants. On va la chercher. */
    const sansImage = liste.filter(c => !c.poster);
    if(sansImage.length){
      const fiches = await Promise.all(sansImage.map(c =>
        tmdb('/'+c.type+'/'+c.id).catch(()=>null)));
      if(seq !== guideSeq) return;
      sansImage.forEach((c,i)=>{
        const f = fiches[i];
        if(!f) return;
        c.poster = f.poster_path || '';
        if(!c.duree) c.duree = f.runtime || 0;
        if(!c.genres.length) c.genres = (f.genres||[]).map(x=>x.id);
        if(!c.note) c.note = f.vote_average || 0;
      });
      liste = liste.filter(c => c.poster);
    }

    liste.forEach(c => { g.vus[c.type+':'+c.id] = 1; });
    g.res = liste; g.loading = false; g.charge = true;
    if(!liste.length)
      g.err = platsProfil().length
        ? 'Rien trouvé dans ce registre sur Cinéflix ni sur tes plateformes.'
        : 'Rien trouvé sur Cinéflix. Ajoute tes abonnements dans « Mes goûts » '+
          'pour élargir les propositions.';
    render();
  }catch(e){
    if(seq !== guideSeq) return;
    g.loading = false; g.charge = true;
    g.err = (e.message === 'BADKEY') ? 'Clé TMDB refusée' : 'Pas de connexion';
    render();
  }
}

function ouvrirGuide(){
  ui.guide = { txt:'', recette:null, res:[], loading:false, err:'', charge:false,
               vus:{}, repli:false, source:'' };
  go('guide');
}
function guiderTexte(){
  const v = (document.getElementById('gtxt')||{}).value || '';
  ui.guide.txt = v;
  if(!v.trim()) return toast('Dis-moi ce dont tu as envie');
  guider('texte', v);
}
function guiderHumeur(id){
  ui.guide.txt = '';
  guider(id, '');
}
function guiderEncore(){
  const g = ui.guide;
  guider(g.source || 'gouts', g.txt || '');
}

/* ---------- L'écran ---------- */
function carteGuide(c){
  return '<button class="gcard" onclick="ouvrirFiche('+c.id+',\''+c.type+'\',\'guide\')">'+
    '<div class="wrapimg">'+ posterEl(c.poster,'w342','',c.titre)+
      (c.flix ? '<div class="tag dispo mini" aria-label="Sur Cinéflix">'+I.check+'</div>' : '')+
    '</div>'+
    '<div class="gname">'+esc(c.titre)+'</div>'+
    '<div class="graison">'+esc(raisonDe(c))+'</div>'+
  '</button>';
}

function viewGuide(){
  const g = ui.guide || (ui.guide = { txt:'', res:[], vus:{} });
  let h = header('Laisse-moi te guider', {back:'goBack()'});

  h += '<div class="wrap">'+
    '<label class="fld"><span>Qu\'est-ce qui te ferait plaisir&nbsp;?</span>'+
      '<input type="text" id="gtxt" value="'+esc(g.txt||'')+'" '+
      'placeholder="j\'ai envie de rire sans me prendre la tête…" autocomplete="off" '+
      'onkeydown="if(event.key===\'Enter\'){this.blur();guiderTexte()}"></label>'+
    '<button class="btn block" style="margin-top:10px" onclick="guiderTexte()">'+
      'Trouve-moi quelque chose</button>'+
  '</div>';

  h += '<div class="wrap" style="padding-top:4px"><div class="gchips">'+
    HUMEURS.map(x=>'<button class="chip humeur'+
      (g.recette && g.recette.titre === x.label ? ' on':'')+
      '" onclick="guiderHumeur(\''+x.id+'\')">'+x.emo+' '+esc(x.label)+'</button>').join('')+
    (aGouts() ? '<button class="chip humeur'+
      (g.source === 'gouts' ? ' on':'')+'" onclick="guiderHumeur(\'gouts\')">'+
      '✨ Selon mes goûts</button>' : '')+
  '</div></div>';

  if(g.loading)
    return h + '<div class="empty"><span class="spin"></span>'+
      '<p style="margin-top:12px">Je cherche…</p></div>';

  if(g.repli && g.charge && !g.err)
    h += '<div class="banner">Je n\'ai pas bien saisi ta demande — voilà ce que '+
         'je te propose d\'après tes goûts.</div>';

  if(g.err)
    return h + '<div class="empty">'+I.boussole+'<h3>Rien à proposer</h3>'+
      '<p>'+esc(g.err)+'</p></div>';

  if(!g.charge)
    return h + '<div class="empty">'+I.boussole+'<h3>Dis-moi ton envie</h3>'+
      '<p>Écris ce dont tu as envie, ou choisis une humeur. '+
      'Je ne proposerai que ce que tu peux lancer maintenant : Cinéflix'+
      (platsProfil().length ? ' et tes plateformes' : '')+'.</p></div>';

  if(!g.res.length)
    return h + '<div class="empty">'+I.boussole+'<h3>Rien trouvé</h3>'+
      '<p>Essaie une autre humeur.</p></div>';

  const r = g.recette || {};
  h += '<div class="sectitle">'+esc(r.titre || 'Pour toi')+
    (r.dits && r.dits.length ? '<span class="cnt">'+esc(r.dits.join(' · '))+'</span>' : '')+
    '</div>';
  h += '<div class="grid">'+g.res.map(carteGuide).join('')+'</div>';
  h += '<div class="wrap"><button class="btn ghost block" onclick="guiderEncore()">'+
    'Autre chose</button></div>';
  return h + '<div class="wrap tiny muted center" style="padding-bottom:26px">'+
    'Uniquement des titres regardables maintenant : Cinéflix'+
    (platsProfil().length ? ' et tes abonnements' : '')+'.</div>';
}
