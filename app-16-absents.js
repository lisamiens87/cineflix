/* ============================ app-16-absents.js ============================
   « Absents en 4K » — deuxième sous-onglet de l'écran Suggestions.

   Le fichier suggestions-4k.json liste les films sortis en 4K UHD en France
   qui ne sont PAS sur le NAS. La soustraction (catalogue DVDFr moins la
   vidéothèque) est faite dehors, à la main : l'app ne calcule rien, elle
   affiche et elle écarte. Alexandre régénère le fichier quand il veut.

   Deux gestes sur chaque affiche, et un seul est réversible :
     le cœur   → le film rejoint les favoris, comme partout ailleurs ;
     la croix  → REFUS DÉFINITIF, table `refus`, ligne (user, liste, film).

   Pourquoi une table à part et pas `ecartes` : `retablirEcartes()` fait un
   DELETE sur TOUTES les lignes de l'utilisateur, et l'écran Catégories offre
   un lien « tout rétablir maintenant ». Un seul appui ressusciterait des
   films bannis pour toujours. Une durée infinie logée dans la même table,
   ce serait aussi deux sens dans une colonne — le genre de chose qui casse
   en silence six mois plus tard. */

const A4K_LOT = 120;                 /* films par lot : 40 rangées de trois */
const A4K_LISTE = '4k';              /* la colonne `liste` de la table refus */

/* ---------- Chargement ----------
   Un seul appel, vers notre propre serveur : le fichier porte déjà les
   chemins d'affiche résolus, aucune requête TMDB n'est nécessaire. */
async function chargerAbsents4k(){
  const a = ui.a4k;
  if(a.loading) return;
  a.loading = true; a.err = '';
  peindre4kTout();
  try{
    const r = await fetch('./suggestions-4k.json?b='+(window.BUILD||''), {cache:'no-cache'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    a.l = (j && j.films) || [];
    a.genere = (j && j.genere_le) || '';
    /* Le titre normalisé est calculé UNE fois : la recherche ne doit pas le
       refaire 884 fois à chaque frappe. Même normalisation que partout. */
    for(let i = 0; i < a.l.length; i++) a.l[i]._n = normVth(a.l[i].titre);
    /* Les décennies dans l'ORDRE DU FICHIER, pas triées : c'est le fichier
       qui décide de l'ordre du mur, et le select doit le suivre. */
    a.decs = [];
    for(let i = 0; i < a.l.length; i++){
      const d = a.l[i].decennie;
      if(d && a.decs.indexOf(d) < 0) a.decs.push(d);
    }
    /* Le fichier livré répète « Justice League : Crisis on Infinite Earths
       Partie 1 » quatre fois. Un doublon d'identifiant, c'est la même fiche :
       on garde la première ligne et on jette les suivantes, plutôt que
       d'afficher quatre fois la même affiche. Les films SANS identifiant ne
       sont pas dédoublonnés — rien ne permet de dire qu'ils sont les mêmes. */
    const vus = {};
    a.l = a.l.filter(f=>{
      const id = id4k(f);
      if(!id) return true;
      if(vus[id]) return false;
      vus[id] = 1; return true;
    });
    a.charge = true;
  }catch(e){
    a.err = 'Impossible de charger la liste des absents en 4K';
  }
  a.loading = false;
  a.page = 0;
  peindre4kTout();
}

/* L'identifiant TMDb, quand il existe. Le fichier livré en compte 21 sans :
   des coffrets et des intégrales qui n'ont pas de fiche TMDb (« Hellraiser -
   Tétralogie », « Trois couleurs : Bleu, Blanc, Rouge »). Ils sont de vrais
   titres, donc ils RESTENT au mur — mais sans identifiant on ne peut ni les
   mettre en favori ni les refuser : deux d'entre eux ne se distinguent pas.
   Leurs deux boutons sont donc retirés plutôt que menteurs. */
function id4k(f){
  const n = Number(f && f.id);
  return (f && f.id != null && isFinite(n) && n > 0) ? n : 0;
}

/* ---------- Ce qui reste à voir ----------
   Un film acheté depuis la dernière régénération sort tout seul : c'est le
   catalogue qui fait foi, comme partout. Et un refus définitif ne revient
   jamais — c'est toute la différence avec les six mois de `ecartes`. */
function absents4kVisibles(){
  const a = ui.a4k;
  const ref = (db.refus && db.refus[A4K_LISTE]) || {};
  const q = normVth(a.q);
  const res = [];
  for(let i = 0; i < a.l.length; i++){
    const f = a.l[i];
    const id = id4k(f);
    if(id && ref[id]) continue;
    if(id && surCineflix('movie', id)) continue;
    if(a.dec && f.decennie !== a.dec) continue;
    if(q && (f._n || '').indexOf(q) < 0) continue;
    res.push(f);
  }
  return res;
}

/* ---------- Le refus définitif ----------
   Le local répond tout de suite, le serveur fait foi. Contrairement à
   `pousserEcart()` qui écrit en `return=minimal`, on COMPTE les lignes :
   le piège maison — RLS qui refuse et répond 200 avec une liste vide —
   ferait revenir un film qu'Alexandre croit banni. */
async function refuser4k(id){
  id = Number(id);
  if(!id) return;                    /* jamais d'écriture sur un film sans fiche */
  db.refus = db.refus || {};
  db.refus[A4K_LISTE] = db.refus[A4K_LISTE] || {};
  db.refus[A4K_LISTE][id] = Date.now();
  saveDB(); peindre4kListe();
  bandeau4k(id);
  try{
    const ok = await pousserRefus(id);
    if(ok === false){
      delete db.refus[A4K_LISTE][id];
      saveDB(); fermerBandeau4k(); peindre4kListe();
      toast('Refus non enregistré : le serveur l\'a écarté');
    }
  }catch(e){
    delete db.refus[A4K_LISTE][id];
    saveDB(); fermerBandeau4k(); peindre4kListe();
    toast('Refus non enregistré');
  }
}

async function pousserRefus(id){
  if(!sbPret() || !connecte()) return true;   /* mode local : rien à pousser */
  const l = await sbFetch('/rest/v1/refus', {method:'POST',
    headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ user_id: db.auth.uid, liste: A4K_LISTE, tmdb_id: id })});
  return Array.isArray(l) ? l.length > 0 : !!l;
}

async function annuler4k(id){
  id = Number(id);
  if(db.refus && db.refus[A4K_LISTE]) delete db.refus[A4K_LISTE][id];
  saveDB(); fermerBandeau4k(); peindre4kListe();
  if(!sbPret() || !connecte()) return;
  try{
    await sbFetch('/rest/v1/refus?user_id=eq.'+encodeURIComponent(db.auth.uid)+
                  '&liste=eq.'+A4K_LISTE+'&tmdb_id=eq.'+id,
                  {method:'DELETE', headers:{ Prefer:'return=minimal' }});
  }catch(e){}
}

/* Les refus du serveur au démarrage : sans eux, un film banni sur le
   téléphone reviendrait sur le bureau. */
async function chargerRefus(){
  if(!sbPret() || !connecte()) return;
  try{
    const l = await sbFetch('/rest/v1/refus?select=liste,tmdb_id&user_id=eq.'+
                            encodeURIComponent(db.auth.uid), {});
    const neuf = {};
    (l||[]).forEach(r=>{ (neuf[r.liste] = neuf[r.liste] || {})[r.tmdb_id] = 1; });
    db.refus = neuf;
    saveDB();
  }catch(e){}
}

/* Le garde-fou : le refus est DÉFINITIF, une croix touchée au pouce dans un
   mur qui défile ne doit pas être sans recours. */
let bandeau4kMinuteur = null;
function fermerBandeau4k(){
  const el = document.getElementById('refusbar');
  if(el) el.remove();
  if(bandeau4kMinuteur){ clearTimeout(bandeau4kMinuteur); bandeau4kMinuteur = null; }
}
function bandeau4k(id){
  fermerBandeau4k();
  const f = (ui.a4k.l||[]).find(x => id4k(x) === id);
  const el = document.createElement('div');
  el.id = 'refusbar'; el.className = 'ecartbar';
  el.innerHTML = '<span>'+esc((f && f.titre) || 'Film')+' écarté définitivement</span>'+
    '<button onclick="annuler4k('+id+')">Annuler</button>';
  document.body.appendChild(el);
  void el.offsetWidth;
  el.classList.add('on');
  bandeau4kMinuteur = setTimeout(fermerBandeau4k, 6000);
}

/* ---------- Le cœur ----------
   Même mécanisme que coeurSugg(), mais les champs du fichier 4K diffèrent
   (`affiche` et non `poster`) : la fonction ne peut pas être réutilisée
   telle quelle. Le film NE DISPARAÎT PAS du mur — le cœur se remplit. */
function coeur4k(id){
  id = Number(id);
  if(!id) return;
  const f = (ui.a4k.l||[]).find(x => id4k(x) === id);
  if(!f) return;
  basculerFavori({ id:f.id, title:f.titre, poster_path:f.affiche||null,
                   release_date:String(f.annee||'')+'-01-01' }, 'movie');
  peindre4kListe();
}

/* ---------- Rendu ----------
   Deux zones repeintes séparément. Le champ de recherche et le select des
   décennies vivent ENTRE l'en-tête et le mur, et ne sont jamais réécrits par
   la frappe : les réécrire ferait perdre le curseur au bout d'une lettre. */
function peindre4kListe(){
  const el = document.getElementById('a4kres');
  if(!el) return render();
  el.innerHTML = mur4kHtml();
}

function peindre4kTout(){
  if(view !== 'sorties' || ui.cineVolet !== 'sugg' || ui.sugg.onglet !== 'q4k') return;
  const l = document.getElementById('a4kres');
  if(!l) return render();
  l.innerHTML = mur4kHtml();
  /* Le select des décennies vit hors de la zone repeinte — c'est ce qui
     protège le curseur du champ de recherche — mais ses options dépendent
     des données, qui arrivent APRÈS le premier rendu. Sans cette réécriture
     il resterait vide à vie : c'est exactement la panne du select des
     dossiers de Ma vidéothèque (3108k). Réécrire remet la sélection à
     zéro : on relit la valeur avant, on la repose après. */
  const d = document.getElementById('a4kdec');
  if(d){
    const garde = d.value;
    d.innerHTML = options4kHtml();
    d.value = garde;
  }
}

function options4kHtml(){
  const a = ui.a4k;
  return '<option value="">Toutes les décennies</option>'+
    (a.decs||[]).map(x=>'<option value="'+esc(x)+'"'+
      (a.dec===x?' selected':'')+'>'+esc(x)+'</option>').join('');
}

function a4kCherche(txt){ ui.a4k.q = txt || ''; ui.a4k.page = 0; peindre4kListe(); }
function a4kDecennie(d){ ui.a4k.dec = d || ''; ui.a4k.page = 0; peindre4kListe(); }
function a4kPlus(){ ui.a4k.page++; peindre4kListe(); }

/* Le mur : par décennie, dans l'ordre du fichier, et par lots. Le lot ne
   coupe PAS aux frontières de décennie — il compte des films, sinon un lot
   pourrait ne contenir qu'un titre. */
function mur4kHtml(){
  const a = ui.a4k;
  if(a.loading) return '<div class="empty"><span class="spin"></span>'+
    '<p style="margin-top:12px">Lecture des absents en 4K…</p></div>';
  if(a.err) return '<div class="empty">'+I.serveur+'<h3>'+esc(a.err)+'</h3>'+
    '<p>Vérifie que suggestions-4k.json est bien en place, puis réessaie.</p>'+
    '<button class="btn ghost" onclick="chargerAbsents4k()">Réessayer</button></div>';

  const vis = absents4kVisibles();
  if(!vis.length) return '<div class="empty">'+I.check+'<h3>Rien à montrer</h3>'+
    '<p>Tout est chez toi, écarté, ou hors du filtre en cours.</p></div>';

  const fin = Math.min(vis.length, (a.page + 1) * A4K_LOT);
  let html = '', dec = null;
  for(let i = 0; i < fin; i++){
    const f = vis[i];
    if(f.decennie !== dec){
      if(dec !== null) html += '</div>';
      dec = f.decennie;
      html += '<div class="sectitle a4ktitre">'+esc(dec || 'Sans décennie')+'</div>'+
              '<div class="a4kgrid">';
    }
    html += carte4kHtml(f);
  }
  if(dec !== null) html += '</div>';
  if(fin < vis.length)
    html += '<div class="plus"><button class="btn ghost" onclick="a4kPlus()">'+
            'Voir plus ('+(vis.length - fin)+' restants)</button></div>';
  return html + '<div class="credit">'+vis.length+' film'+(vis.length>1?'s':'')+
         ' sorti'+(vis.length>1?'s':'')+' en 4K que tu n\'as pas'+
         (ui.a4k.genere ? ' · liste du '+esc(ui.a4k.genere) : '')+'</div>';
}

/* Cœur à GAUCHE, croix à DROITE, aux deux bords de l'affiche : le geste
   positif d'un côté, l'irréversible de l'autre. Les deux sont VISIBLES en
   permanence — au doigt, il n'y a pas de survol. */
function carte4kHtml(f){
  const id = id4k(f);
  /* Sans identifiant : la vignette reste, mais muette. Ouvrir une fiche sur
     un identifiant absent donnerait un panneau vide, et les deux gestes
     porteraient sur un film qu'on ne sait pas désigner. */
  if(!id)
    return '<div class="a4kc muet">'+
      '<div class="wrapimg">'+posterEl(f.affiche,'w342','',f.titre)+'</div>'+
      '<div class="sgnom">'+esc(f.titre)+'</div>'+
      '<div class="sgy">'+esc(String(f.annee||''))+'</div>'+
    '</div>';
  const it = item('movie', id);
  const fav = !!(it && it.fav);
  return '<div class="a4kc" onclick="ouvrirFiche('+id+',\'movie\')">'+
    '<div class="wrapimg">'+posterEl(f.affiche,'w342','',f.titre)+
      '<div class="sgact sgg">'+
        '<button class="'+(fav?'on':'')+'" onclick="event.stopPropagation();coeur4k('+id+')" '+
          'aria-label="Je le veux">'+(fav ? '♥' : '♡')+'</button>'+
      '</div>'+
      '<div class="sgact">'+
        '<button class="no" onclick="event.stopPropagation();refuser4k('+id+')" '+
          'aria-label="Jamais celui-là">✕</button>'+
      '</div>'+
    '</div>'+
    '<div class="sgnom">'+esc(f.titre)+'</div>'+
    '<div class="sgy">'+esc(String(f.annee||''))+'</div>'+
  '</div>';
}

/* ---------- L'écran ---------- */
function corpsAbsents4k(){
  const a = ui.a4k;
  return '<div class="vtfiltres">'+
      '<input id="a4kq" type="search" placeholder="Chercher un titre" '+
        'autocomplete="off" autocorrect="off" spellcheck="false" '+
        'value="'+esc(a.q)+'" oninput="a4kCherche(this.value)">'+
      '<select id="a4kdec" onchange="a4kDecennie(this.value)">'+
        options4kHtml()+
      '</select>'+
    '</div>'+
    '<div id="a4kres">'+mur4kHtml()+'</div>'+
    '<div style="height:24px"></div>';
}
