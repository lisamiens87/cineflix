"use strict";
/* ========================= Ma vidéothèque =========================
   Troisième volet de l'écran Cinéma, réservé à l'administration : les
   2 300 films du NAS confrontés au catalogue des éditions physiques, pour
   voir d'un coup d'œil ce qui existe en mieux ailleurs.

   Le principe est celui du reste de l'app : on ne déduit pas, on constate.
   La couleur d'un film ne dit pas « ce fichier est mauvais » — personne
   n'ouvre le fichier ici — elle dit « le rangement du NAS annonce tel palier,
   et le marché propose tel support ». Quand les deux se contredisent, c'est
   à l'œil humain de trancher, et la correction manuelle est là pour ça.

   Trois tables, chargées UNE FOIS et gardées en mémoire :
     videotheque             ce que je possède, une ligne par fichier
     editions_dvdfr          ce qui existe dans le commerce
     videotheque_corrections mes verdicts — la seule que l'app écrive

   La clé de rapprochement est « titre normalisé|année », produite par
   Scan_Catalogue_Qualite.ps1 côté NAS. */

const VTH_LOT  = 100;    /* lignes rendues par lot (motif de Découvrir) */
const VTH_PAGE = 1000;   /* lignes demandées par requête, cf. vthTout() */

/* Les rangs. DVD et HD_COMPRESSE partagent le rang 1 : un DVD et un 1080p
   compressé se valent du point de vue de « faut-il racheter ». */
const VTH_RANG_PALIER  = { BAS:0, DVD:1, HD_COMPRESSE:1, BLURAY:2, UHD4K:3 };
const VTH_RANG_SUPPORT = { DVD:1, BLURAY:2, UHD4K:3 };
const VTH_LIB_SUPPORT  = { DVD:'DVD', BLURAY:'Blu-ray', UHD4K:'4K' };

/* Les quatre compteurs, qui sont aussi les quatre filtres. L'ordre est celui
   de l'urgence : ce qui va bien d'abord, ce qui demande du travail ensuite. */
const VTH_FILTRES = [
  { id:'max',    cl:'vert',   label:'Au maximum' },
  { id:'ameli',  cl:'orange', label:'Améliorable' },
  { id:'rappr',  cl:'rouge',  label:'À rapprocher' },
  { id:'nonref', cl:'gris',   label:'Non référencé' }
];
const VTH_CL_PAR_FILTRE = { max:'vert', ameli:'orange', rappr:'rouge', nonref:'gris' };

/* ---------- Normalisation ----------
   Même règle que la clé du NAS : minuscules, accents et ponctuation retirés.
   Sans elle, « Amélie » ne trouve pas « Amelie » dans la recherche. */
function normVth(s){
  if(!s) return '';
  let t = String(s).toLowerCase();
  try{
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }catch(e){}
  return t.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fmtOctets(n){
  const o = Number(n) || 0;
  if(o >= 1073741824) return (o / 1073741824).toFixed(1).replace('.', ',') + ' Go';
  if(o >= 1048576)    return Math.round(o / 1048576) + ' Mo';
  return o + ' o';
}

/* ---------- Lecture des tables ----------
   PIÈGE : PostgREST plafonne le nombre de lignes rendues (1 000 par défaut
   chez Supabase) et ne le dit pas — il répond 200 avec une liste tronquée.
   Une lecture nue de `videotheque` rendrait 1 000 films sur 2 307, et l'écran
   serait faux sans la moindre erreur. On pagine donc explicitement par
   en-tête Range, jusqu'à recevoir un lot incomplet.

   L'ordre est imposé (`order=cle`) et non laissé au hasard : sans ordre
   stable, deux pages successives peuvent répéter ou sauter des lignes. */
async function vthTout(table, colonnes){
  const tout = [];
  let debut = 0;
  for(;;){
    const url = '/rest/v1/' + table + '?select=' + colonnes + '&order=cle';
    const lot = await sbFetch(url, { headers:{
      'Range-Unit':'items', Range: debut + '-' + (debut + VTH_PAGE - 1) } });
    const l = Array.isArray(lot) ? lot : [];
    for(let i = 0; i < l.length; i++) tout.push(l[i]);
    if(l.length < VTH_PAGE) break;
    debut += VTH_PAGE;
    if(debut > 500000) break;             /* garde-fou : jamais de boucle infinie */
  }
  return tout;
}

/* Les trois tables ensemble, puis un seul affichage. Charger la vidéothèque
   d'abord et les éditions ensuite donnerait un premier écran plus rapide,
   mais les couleurs basculeraient sous les yeux une seconde plus tard :
   l'attente franche est préférable à un écran qui se dédit. */
async function chargerVideotheque(){
  const v = ui.vth;
  if(v.loading) return;
  if(!(typeof estAdmin !== 'undefined' && estAdmin)){
    v.err = 'Réservé à l\'administration.'; v.charge = true; return peindreVthTout();
  }
  if(typeof sbPret !== 'function' || !sbPret() || !connecte()){
    v.err = 'Serveur non configuré.'; v.charge = true; return peindreVthTout();
  }
  v.loading = true; v.err = '';
  peindreVthTout();
  try{
    const lots = await Promise.all([
      vthTout('videotheque',
              'cle,titre,annee,palier,dossier,chemin,taille_octets,date_modif'),
      vthTout('editions_dvdfr',
              'cle,titre,annee,realisateur,editeur,meilleur_support'),
      vthTout('videotheque_corrections',
              'cle,statut,support_force,cle_dvdfr,verifie_le')
    ]);
    v.films = lots[0];
    v.edts  = lots[1];

    /* Deux index : par clé pour la jointure, et le titre normalisé mis de
       côté pour que la recherche ne le recalcule pas 18 000 fois par frappe. */
    v.edtsParCle = {};
    for(let i = 0; i < v.edts.length; i++){
      const e = v.edts[i];
      e._n = normVth(e.titre);
      if(e.cle) v.edtsParCle[e.cle] = e;
    }
    v.corr = {};
    for(let i = 0; i < lots[2].length; i++){
      const c = lots[2][i];
      if(c.cle) v.corr[c.cle] = c;
    }
    v.dossiers = [];
    for(let i = 0; i < v.films.length; i++){
      const f = v.films[i];
      f._n = normVth(f.titre);
      if(f.dossier && v.dossiers.indexOf(f.dossier) < 0) v.dossiers.push(f.dossier);
    }
    v.dossiers.sort();
    /* Tri alphabétique par titre, décidé une fois pour toutes : on cherche un
       film précis bien plus souvent qu'on ne parcourt un dossier, et le
       filtre par dossier couvre l'autre besoin. L'ordre ne bouge plus
       ensuite — c'est ce qui permet de désigner un film par son INDICE dans
       ce tableau, sans jamais passer sa clé dans un attribut onclick. */
    v.films.sort((a,b)=> String(a.titre||'').localeCompare(String(b.titre||''), 'fr'));
    recalculerCouleursVth();
    v.charge = true;
  }catch(e){
    v.err = (e && e.message) || 'lecture impossible';
  }
  v.loading = false;
  peindreVthTout();
}

/* ---------- La couleur d'un film ----------
   Fonction PURE : elle ne lit que ses arguments, ne touche à rien, et c'est
   ce qui la rend vérifiable sans base de données.
     film       ligne de videotheque
     edition    ligne de editions_dvdfr rapprochée, ou null
     correction ligne de videotheque_corrections, ou null
   Rend { cl, libelle, support }. */
function couleurFilm(film, edition, correction){
  const c = correction || null;

  /* 1. Le verdict humain prime sur tout le reste : « j'ai regardé, c'est
        au maximum de ce qui existe pour ce film ». On n'affiche PAS le
        support du marché sur cette pastille — dire « 4K » en vert sur un
        film qu'on possède en DVD serait un contresens. */
  if(c && c.statut === 'VERIFIE_MAX')
    return { cl:'vert', libelle:'Au maximum', support:'' };

  /* 2. Le meilleur support connu, par ordre de confiance : ce que j'ai
        corrigé à la main, puis l'édition que j'ai rattachée moi-même, puis
        la jointure automatique sur la clé. */
  let sup = '';
  if(c && c.support_force && VTH_RANG_SUPPORT[c.support_force]) sup = c.support_force;
  else if(edition && edition.meilleur_support && VTH_RANG_SUPPORT[edition.meilleur_support])
    sup = edition.meilleur_support;

  if(sup){
    /* Un palier inconnu compte pour 0 : mieux vaut signaler un film à
       regarder que le classer d'office « au maximum ». */
    const rp = VTH_RANG_PALIER[film.palier];
    const rs = VTH_RANG_SUPPORT[sup];
    return { cl: (rs <= (rp === undefined ? 0 : rp)) ? 'vert' : 'orange',
             libelle: VTH_LIB_SUPPORT[sup], support: sup };
  }

  /* 3. Rien trouvé. Un Blu-ray ou un 1080p sans édition connue est
        probablement un défaut de rapprochement, pas une absence du marché :
        il part dans la file à traiter. Les autres paliers restent gris. */
  if(film.palier === 'BLURAY' || film.palier === 'HD_COMPRESSE')
    return { cl:'rouge', libelle:'À rapprocher', support:'' };
  return { cl:'gris', libelle:'Non référencé', support:'' };
}

/* L'édition qui fait foi pour un film : celle que j'ai rattachée à la main
   s'il y en a une, sinon celle que la clé rapproche toute seule. Un
   rattachement manuel est un fait, la jointure n'est qu'une présomption. */
function editionVth(f){
  const v = ui.vth, c = v.corr[f.cle];
  if(c && c.cle_dvdfr && v.edtsParCle[c.cle_dvdfr]) return v.edtsParCle[c.cle_dvdfr];
  return v.edtsParCle[f.cle] || null;
}

/* La couleur est calculée une fois par film et rangée sur la ligne : le
   filtre, les compteurs et la file « Suivant » la relisent des dizaines de
   fois, il serait absurde de la recalculer à chaque passage. */
function recalculerCouleursVth(){
  const v = ui.vth;
  v.compte = { max:0, ameli:0, rappr:0, nonref:0 };
  for(let i = 0; i < v.films.length; i++){
    const f = v.films[i];
    const r = couleurFilm(f, editionVth(f), v.corr[f.cle] || null);
    f._cl = r.cl; f._lib = r.libelle; f._sup = r.support;
    if(r.cl === 'vert')        v.compte.max++;
    else if(r.cl === 'orange') v.compte.ameli++;
    else if(r.cl === 'rouge')  v.compte.rappr++;
    else                       v.compte.nonref++;
  }
}

/* ---------- Filtrage ---------- */
function filmsVthFiltres(){
  const v = ui.vth;
  const cl = v.filtre ? VTH_CL_PAR_FILTRE[v.filtre] : '';
  const q  = normVth(v.q);
  const res = [];
  for(let i = 0; i < v.films.length; i++){
    const f = v.films[i];
    if(cl && f._cl !== cl) continue;
    if(v.dossier && f.dossier !== v.dossier) continue;
    if(q && (f._n || '').indexOf(q) < 0) continue;
    res.push(f);
  }
  return res;
}

function setFiltreVth(id){
  const v = ui.vth;
  v.filtre = (v.filtre === id) ? '' : id;   /* un second clic annule */
  v.page = 0;
  peindreVthTout();
}
function vthCherche(txt){
  ui.vth.q = txt || '';
  ui.vth.page = 0;
  peindreVthListe();          /* la liste seule : le champ garde le curseur */
}
function vthDossier(d){
  ui.vth.dossier = d || '';
  ui.vth.page = 0;
  peindreVthListe();
}
function vthPlus(){
  ui.vth.page++;
  peindreVthListe();
}

/* ---------- Rendu ----------
   Deux zones repeintes séparément. Le champ de recherche vit ENTRE elles et
   n'est jamais réécrit : le réécrire à chaque frappe ferait perdre le
   curseur au bout d'une lettre. */
function peindreVthListe(){
  const el = document.getElementById('vthres');
  if(!el) return render();
  el.innerHTML = listeVthHtml();
}
function peindreVthTout(){
  if(view !== 'sorties' || ui.cineVolet !== 'vth') return;
  const c = document.getElementById('vthcpt');
  const l = document.getElementById('vthres');
  if(!c || !l) return render();
  c.innerHTML = compteursVthHtml();
  l.innerHTML = listeVthHtml();
}

function compteursVthHtml(){
  const v = ui.vth;
  return VTH_FILTRES.map(f=>
    '<button class="chip vtf '+f.cl+(v.filtre===f.id?' on':'')+
    '" onclick="setFiltreVth(\''+f.id+'\')">'+f.label+
    ' <span>'+((v.compte||{})[f.id] || 0)+'</span></button>').join('');
}

function ligneVthHtml(f, i){
  const sous = [f.annee || '', f.dossier || '', fmtOctets(f.taille_octets),
                ((editionVth(f)||{}).editeur || '')].filter(Boolean).join(' · ');
  return '<button class="crow vtrow" onclick="ouvrirFilmVth('+i+')">'+
    '<div class="cinfo">'+
      '<div class="cname2">'+esc(f.titre || '(sans titre)')+'</div>'+
      '<div class="csub">'+esc(sous)+'</div>'+
    '</div>'+
    '<span class="vtp '+f._cl+'">'+esc(f._lib)+'</span>'+
  '</button>';
}

function listeVthHtml(){
  const v = ui.vth;
  if(v.loading) return '<div class="empty"><span class="spin"></span>'+
    '<p style="margin-top:12px">Lecture des trois tables…</p></div>';
  if(v.err) return '<div class="empty">'+I.serveur+'<h3>'+esc(v.err)+'</h3>'+
    '<button class="btn ghost" onclick="ui.vth.err=\'\';chargerVideotheque()">Réessayer</button></div>';
  const l = filmsVthFiltres();
  if(!l.length) return '<div class="empty">'+I.search+'<h3>Aucun film avec ces filtres</h3>'+
    '<p>Retire le filtre de couleur, ou vide la recherche.</p></div>';
  const fin = Math.min(l.length, (v.page + 1) * VTH_LOT);
  let html = '';
  for(let i = 0; i < fin; i++) html += ligneVthHtml(l[i], v.films.indexOf(l[i]));
  if(fin < l.length)
    html += '<div class="plus"><button class="btn ghost" onclick="vthPlus()">'+
            'Voir plus ('+(l.length - fin)+' restants)</button></div>';
  return html;
}

function corpsVideotheque(){
  const v = ui.vth;
  return '<div class="chips vtcpt" id="vthcpt">'+compteursVthHtml()+'</div>'+
    '<div class="vtfiltres">'+
      '<input id="vthq" type="search" placeholder="Chercher un titre" '+
        'autocomplete="off" autocorrect="off" spellcheck="false" '+
        'value="'+esc(v.q)+'" oninput="vthCherche(this.value)">'+
      '<select id="vthdos" onchange="vthDossier(this.value)">'+
        '<option value="">Tous les dossiers</option>'+
        (v.dossiers||[]).map(d=>'<option value="'+esc(d)+'"'+
          (v.dossier===d?' selected':'')+'>'+esc(d)+'</option>').join('')+
      '</select>'+
    '</div>'+
    '<div id="vthres">'+listeVthHtml()+'</div>'+
    '<div style="height:24px"></div>';
}

/* ---------- Le panneau d'un film ----------
   Deux formes : celle d'un film rapproché (on ajuste le support), et celle
   d'un film à traiter (on cherche son édition, ou on déclare qu'il est au
   maximum). Le film est désigné par son indice dans `ui.vth.films`, dont
   l'ordre ne bouge jamais après le chargement. */
function ouvrirFilmVth(i){
  const f = ui.vth.films[i];
  if(!f) return;
  ui.vth.ouvert = i;
  ui.vth.statutChoisi = (ui.vth.corr[f.cle] || {}).statut || '';
  ui.vth.qDvd = '';
  openSheet(sheetVthHtml(i));
}

function sheetVthHtml(i){
  const v = ui.vth, f = v.films[i];
  const c     = v.corr[f.cle] || null;
  const edVue = editionVth(f);

  let h = '<h3>'+esc(f.titre || '(sans titre)')+'</h3>'+
    '<p class="small muted" style="margin:0 0 10px">'+
      esc([f.annee || '', (edVue && edVue.realisateur) || ''].filter(Boolean).join(' · '))+'</p>';

  if(f._cl === 'vert' || f._cl === 'orange'){
    h += '<div class="fgrp">Ce que je possède</div>'+
      '<div class="small muted">'+esc([f.dossier || '',
        (f.chemin || '').split(/[\\/]/).pop() || '', fmtOctets(f.taille_octets)]
        .filter(Boolean).join(' · '))+'</div>'+
      '<div class="fgrp">Disponible sur le marché</div>'+
      '<div class="small muted">'+
        (f._sup ? '<span class="vtp '+f._cl+'">'+esc(VTH_LIB_SUPPORT[f._sup])+'</span> ' : '')+
        esc((edVue && edVue.editeur) || 'éditeur inconnu')+'</div>'+
      '<div class="fgrp">Correction manuelle</div>'+
      '<select id="vthsup">'+
        '<option value="">— support réel —</option>'+
        Object.keys(VTH_RANG_SUPPORT).map(s=>'<option value="'+s+'"'+
          ((c && c.support_force === s) ? ' selected' : '')+'>'+
          VTH_LIB_SUPPORT[s]+'</option>').join('')+
      '</select>'+
      '<button class="btn block" style="margin-top:10px" onclick="vthEnregistrerSupport()">'+
        'Enregistrer</button>';
    return h;
  }

  /* Rouge ou gris : la file de travail. */
  h += '<div class="small muted">'+esc([f.annee || '', f.dossier || '',
        fmtOctets(f.taille_octets)].filter(Boolean).join(' · '))+'</div>'+
    '<div class="fgrp">Chercher dans DVDFr</div>'+
    '<input id="vthqd" type="search" placeholder="Titre de l\'édition" '+
      'autocomplete="off" spellcheck="false" oninput="vthChercheDvdfr(this.value)">'+
    '<div id="vthdvd">'+resultatsDvdfrHtml()+'</div>'+
    '<div class="fgrp">Statut</div>'+
    '<div id="vthstat">'+statutVthHtml()+'</div>'+
    '<button class="btn block" style="margin-top:10px" onclick="vthEnregistrerStatut()">'+
      'Enregistrer</button>'+
    '<button class="btn ghost block" style="margin-top:8px" onclick="vthSuivant()">'+
      'Suivant</button>'+
    '<div class="tiny muted center" style="margin-top:6px">'+
      resteVth()+' film(s) à traiter</div>';
  return h;
}

function statutVthHtml(){
  const s = ui.vth.statutChoisi || '';
  return '<button class="chip '+(s==='VERIFIE_MAX'?'on':'')+
      '" onclick="vthChoisirStatut(\'VERIFIE_MAX\')">Vérifié, qualité maximum sur le NAS</button>'+
    '<button class="chip '+(s==='A_REVOIR'?'on':'')+
      '" onclick="vthChoisirStatut(\'A_REVOIR\')">À revoir plus tard</button>';
}
function vthChoisirStatut(s){
  ui.vth.statutChoisi = (ui.vth.statutChoisi === s) ? '' : s;
  const el = document.getElementById('vthstat');
  if(el) el.innerHTML = statutVthHtml();
}

/* La recherche DVDFr travaille sur les 18 000 éditions déjà en mémoire :
   aucun appel réseau, et le titre normalisé a été calculé au chargement. */
function vthChercheDvdfr(txt){
  ui.vth.qDvd = txt || '';
  const el = document.getElementById('vthdvd');
  if(el) el.innerHTML = resultatsDvdfrHtml();
}
function resultatsDvdfrHtml(){
  const v = ui.vth;
  const q = normVth(v.qDvd);
  if(q.length < 2)
    return '<div class="tiny muted" style="padding:6px 0">Tape au moins deux lettres.</div>';
  const res = [];
  for(let i = 0; i < v.edts.length && res.length < 30; i++){
    if((v.edts[i]._n || '').indexOf(q) >= 0) res.push(v.edts[i]);
  }
  if(!res.length)
    return '<div class="tiny muted" style="padding:6px 0">Aucune édition trouvée.</div>';
  return res.map(e=>'<button class="opt" onclick="vthRattacher(\''+
      esc(String(e.cle).replace(/'/g, '')) +'\')">'+
      esc(e.titre || '')+' <span class="muted">'+
      esc([e.annee || '', e.editeur || '',
           VTH_LIB_SUPPORT[e.meilleur_support] || ''].filter(Boolean).join(' · '))+
      '</span></button>').join('');
}

/* ---------- Écritures ----------
   La seule table que l'app écrit. `merge-duplicates` fait l'upsert sur la
   clé ; seules les colonnes envoyées sont mises à jour, les autres gardent
   leur valeur.

   Et le piège maison : quand RLS refuse, PostgREST répond 200 avec une
   LISTE VIDE, sans la moindre erreur. On demande donc la représentation et
   on COMPTE les lignes — sans ça, un refus ressemblerait à un succès. */
async function vthEcrire(cle, champs){
  try{
    const r = await sbFetch('/rest/v1/videotheque_corrections',
      { method:'POST',
        headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(Object.assign({ cle: cle }, champs)) });
    if(!Array.isArray(r) || !r.length){
      toast('Refusé par le serveur — rien n\'a changé.');
      return false;
    }
    ui.vth.corr[cle] = Object.assign(ui.vth.corr[cle] || { cle: cle }, r[0]);
    recalculerCouleursVth();
    return true;
  }catch(e){
    toast('Échec : ' + ((e && e.message) || 'réessaie'));
    return false;
  }
}

async function vthEnregistrerSupport(){
  const f = ui.vth.films[ui.vth.ouvert];
  const el = document.getElementById('vthsup');
  if(!f || !el) return;
  const s = el.value || '';
  if(!s) return toast('Choisis un support.');
  if(await vthEcrire(f.cle, { support_force: s })){
    closeSheet(); peindreVthTout();
    toast('Support corrigé : ' + VTH_LIB_SUPPORT[s]);
  }
}

async function vthRattacher(cleDvdfr){
  const f = ui.vth.films[ui.vth.ouvert];
  if(!f || !cleDvdfr) return;
  if(await vthEcrire(f.cle, { cle_dvdfr: cleDvdfr })){
    closeSheet(); peindreVthTout();
    toast('Édition rattachée');
  }
}

async function vthEnregistrerStatut(){
  const f = ui.vth.films[ui.vth.ouvert];
  if(!f) return;
  const s = ui.vth.statutChoisi;
  if(!s) return toast('Choisis un statut.');
  const champs = { statut: s };
  /* La date n'a de sens que sur un verdict : elle dit QUAND j'ai regardé. */
  if(s === 'VERIFIE_MAX') champs.verifie_le = new Date().toISOString();
  if(await vthEcrire(f.cle, champs)){
    closeSheet(); peindreVthTout();
    toast(s === 'VERIFIE_MAX' ? 'Marqué au maximum' : 'Remis à plus tard');
  }
}

/* ---------- La file ----------
   « Suivant » suit ce qu'on a sous les yeux : la liste filtrée telle
   qu'elle est affichée, restreinte aux films qui restent à traiter. */
function fileVth(){
  return filmsVthFiltres().filter(f => f._cl === 'rouge' || f._cl === 'gris');
}
function resteVth(){ return fileVth().length; }

function vthSuivant(){
  const v = ui.vth;
  const f = v.films[v.ouvert];
  const file = fileVth();
  if(!file.length){ closeSheet(); peindreVthTout(); return toast('Plus rien à traiter'); }
  let k = f ? file.indexOf(f) : -1;
  /* Le film courant a pu quitter la file (il vient d'être traité) : on
     reprend alors au premier de ce qui reste, pas au hasard. */
  const suivant = (k >= 0 && k + 1 < file.length) ? file[k + 1] : file[0];
  peindreVthTout();
  ouvrirFilmVth(v.films.indexOf(suivant));
}

/* ---------- L'écran ---------- */
function viewVideotheque(){
  return corpsVideotheque();
}
