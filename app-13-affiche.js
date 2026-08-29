"use strict";
/* ========================= L'affiche en grand =========================
   Demande d'Alexandre le 29/08 : « quand je lis le synopsis et que je clique
   sur la jaquette, j'aimerais l'avoir en grand pour zoomer dessus ».

   Deux raisons de l'écrire à la main plutôt que de laisser faire le
   navigateur : index.html pose `user-scalable=no` et app-base.css pose
   `touch-action:manipulation` sur le corps. C'est voulu — sans ça l'app se
   met à glisser et à grossir comme une page web au moindre geste — mais ça
   supprime aussi le pincement là où on en voudrait. On le rend donc ici, et
   nulle part ailleurs.

   Trois définitions successives, pour qu'il n'y ait jamais d'écran vide :
   le w342 est DÉJÀ affiché sur la fiche, donc déjà dans le cache du
   navigateur — il s'ouvre instantanément, un peu flou. Le w780 le remplace
   quand il arrive, puis l'originale (souvent 2000 × 3000). On ne substitue
   qu'une image entièrement décodée : aucun clignotement. */

let AFF = null;                 /* l'état courant, null quand c'est fermé */
const AFF_MIN = 1, AFF_MAX = 6, AFF_DOUBLE = 2.5;

const afficheOuverte = () => !!AFF;

function ouvrirAffiche(path, titre){
  if(!path || AFF) return;

  const boite = document.createElement('div');
  boite.className = 'affv';
  boite.setAttribute('role', 'dialog');
  boite.setAttribute('aria-modal', 'true');
  boite.setAttribute('aria-label', 'Affiche de ' + (titre || ''));
  boite.innerHTML =
    '<div class="afffond"></div>' +
    '<img class="affimg" alt="' + esc(titre || '') + '" src="' + IMG(path, 'w342') + '">' +
    '<div class="affbar">' +
      '<button class="affx" aria-label="Fermer">✕</button>' +
      '<span class="affnom">' + esc(titre || '') + '</span>' +
    '</div>';
  document.body.appendChild(boite);
  document.body.classList.add('affon');

  AFF = { boite:boite,
          img:  boite.querySelector('.affimg'),
          fond: boite.querySelector('.afffond'),
          bar:  boite.querySelector('.affbar'),
          s:1, tx:0, ty:0,
          doigts:new Map(), pince:null, glisse:null, dernierTap:0 };

  boite.querySelector('.affx').addEventListener('click', fermerAffiche);
  boite.addEventListener('pointerdown',   affDown);
  boite.addEventListener('pointermove',   affMove);
  boite.addEventListener('pointerup',     affUp);
  boite.addEventListener('pointercancel', affUp);
  boite.addEventListener('wheel',         affRoulette, {passive:false});

  monter(path, 'w780');
  monter(path, 'original');
}

/* Charge une définition supérieure à côté, et ne l'installe que si elle est
   arrivée entière ET que la visionneuse est toujours ouverte sur la même
   affiche. Une image qui arrive après la fermeture ne fait rien. */
function monter(path, taille){
  const url = IMG(path, taille);
  const pre = new Image();
  pre.onload = ()=>{
    if(!AFF || AFF.img.dataset.fini === '1') return;
    AFF.img.src = url;
    if(taille === 'original') AFF.img.dataset.fini = '1';
  };
  pre.src = url;
}

function fermerAffiche(){
  if(!AFF) return;
  AFF.boite.remove();
  document.body.classList.remove('affon');
  AFF = null;
}

/* La taille de l'image AVANT transformation : `offsetWidth` l'ignore, au
   contraire de `getBoundingClientRect`. C'est elle qui donne les bornes. */
function affBorner(){
  const w = AFF.img.offsetWidth, h = AFF.img.offsetHeight;
  const maxX = Math.max(0, (w*AFF.s - innerWidth)/2);
  const maxY = Math.max(0, (h*AFF.s - innerHeight)/2);
  AFF.tx = Math.min(maxX, Math.max(-maxX, AFF.tx));
  AFF.ty = Math.min(maxY, Math.max(-maxY, AFF.ty));
}
function affPoser(){
  AFF.img.style.transform =
    'translate('+AFF.tx+'px,'+AFF.ty+'px) scale('+AFF.s+')';
}

/* Zoomer en gardant fixe le point visé : c'est ce qui fait qu'on grossit le
   détail qu'on regarde, et pas le centre de l'écran. */
function affZoomer(vers, px, py){
  vers = Math.min(AFF_MAX, Math.max(AFF_MIN, vers));
  const cx = innerWidth/2, cy = innerHeight/2;
  const ux = (px - cx - AFF.tx)/AFF.s, uy = (py - cy - AFF.ty)/AFF.s;
  AFF.tx = px - cx - ux*vers;
  AFF.ty = py - cy - uy*vers;
  AFF.s  = vers;
  if(AFF.s === AFF_MIN){ AFF.tx = 0; AFF.ty = 0; }
  affBorner(); affPoser();
}

const affMilieu = ()=>{
  const p = [...AFF.doigts.values()];
  return { x:(p[0].x+p[1].x)/2, y:(p[0].y+p[1].y)/2,
           d:Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y) };
};

function affDown(e){
  if(!AFF || e.target.closest('.affbar')) return;
  AFF.boite.setPointerCapture(e.pointerId);
  AFF.doigts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  AFF.img.style.transition = 'none';

  if(AFF.doigts.size === 2){
    const m = affMilieu();
    AFF.pince = { d0:m.d, s0:AFF.s, cx:m.x, cy:m.y, tx0:AFF.tx, ty0:AFF.ty };
    AFF.glisse = null;
    return;
  }
  if(AFF.doigts.size === 1){
    const t = Date.now();
    if(t - AFF.dernierTap < 300){          /* deux appuis rapprochés */
      AFF.dernierTap = 0;
      AFF.img.style.transition = 'transform .22s cubic-bezier(.2,.8,.3,1)';
      if(AFF.s > 1.05) affZoomer(1, innerWidth/2, innerHeight/2);
      else             affZoomer(AFF_DOUBLE, e.clientX, e.clientY);
      return;
    }
    AFF.dernierTap = t;
    AFF.glisse = { x0:e.clientX, y0:e.clientY, tx0:AFF.tx, ty0:AFF.ty,
                   ferme:(AFF.s <= 1.02) };
  }
}

function affMove(e){
  if(!AFF || !AFF.doigts.has(e.pointerId)) return;
  AFF.doigts.set(e.pointerId, {x:e.clientX, y:e.clientY});

  if(AFF.pince && AFF.doigts.size >= 2){
    /* On repart toujours de l'état du DÉBUT du pincement : cumuler les
       petits écarts d'une image à l'autre fait dériver l'affiche. */
    const m = affMilieu(), p = AFF.pince;
    const cx = innerWidth/2, cy = innerHeight/2;
    const ux = (p.cx - cx - p.tx0)/p.s0, uy = (p.cy - cy - p.ty0)/p.s0;
    AFF.s  = Math.min(AFF_MAX, Math.max(AFF_MIN, p.s0 * (m.d/p.d0)));
    AFF.tx = m.x - cx - ux*AFF.s;
    AFF.ty = m.y - cy - uy*AFF.s;
    affBorner(); affPoser();
    return;
  }

  if(AFF.glisse && AFF.doigts.size === 1){
    const dx = e.clientX - AFF.glisse.x0, dy = e.clientY - AFF.glisse.y0;
    if(Math.abs(dx) + Math.abs(dy) > 8) AFF.dernierTap = 0;
    if(AFF.glisse.ferme){
      /* Pas zoomé : le glissé vers le bas referme, et l'image suit le doigt
         pour qu'on voie qu'on est en train de fermer, pas de déplacer. */
      AFF.tx = dx*0.35; AFF.ty = dy;
      const p = Math.min(1, Math.abs(dy)/260);
      AFF.fond.style.opacity = 1 - p*0.85;
      AFF.img.style.transform =
        'translate('+AFF.tx+'px,'+AFF.ty+'px) scale('+(1 - p*0.12)+')';
      AFF.bar.classList.toggle('discret', p > 0.06);
    }else{
      AFF.tx = AFF.glisse.tx0 + dx; AFF.ty = AFF.glisse.ty0 + dy;
      affBorner(); affPoser();
    }
  }
}

function affUp(e){
  if(!AFF) return;
  AFF.doigts.delete(e.pointerId);
  if(AFF.doigts.size < 2) AFF.pince = null;

  if(AFF.glisse && AFF.glisse.ferme && AFF.doigts.size === 0){
    const partie = Math.abs(AFF.ty) > 110;
    AFF.img.style.transition  = 'transform .26s ease';
    AFF.fond.style.transition = 'opacity .26s ease';
    if(partie){
      AFF.img.style.transform = 'translate('+AFF.tx+'px,'+
        (AFF.ty > 0 ? innerHeight : -innerHeight)+'px) scale(.7)';
      AFF.fond.style.opacity = 0;
      setTimeout(fermerAffiche, 240);
    }else{
      AFF.tx = 0; AFF.ty = 0; affPoser();
      AFF.fond.style.opacity = 1;
      AFF.bar.classList.remove('discret');
    }
  }
  if(AFF.doigts.size === 0) AFF.glisse = null;
}

/* La molette et le trackpad : c'est le même écran sur grand écran. */
function affRoulette(e){
  if(!AFF) return;
  e.preventDefault();
  AFF.img.style.transition = 'none';
  affZoomer(AFF.s * (e.deltaY < 0 ? 1.12 : 1/1.12), e.clientX, e.clientY);
}

window.addEventListener('keydown', e=>{
  if(!AFF) return;
  if(e.key === 'Escape') fermerAffiche();
});
window.addEventListener('resize', ()=>{ if(AFF){ affBorner(); affPoser(); } });

/* Le point d'entrée depuis la fiche : pas d'argument, donc pas de titre à
   échapper dans un attribut `onclick` — on relit l'état courant. */
function ouvrirAfficheFiche(){
  const st = ui.fiche || {}, d = st.data;
  if(!d || !d.poster_path) return;
  ouvrirAffiche(d.poster_path, st.type === 'tv' ? (d.name || '') : (d.title || ''));
}
