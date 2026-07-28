"use strict";
/* ============================================================
   Cinéflix — configuration du serveur
   Le seul fichier à modifier pour brancher l'app. Il est chargé avant
   tout le reste et fournit les valeurs par défaut de chaque appareil.
   ============================================================ */

window.CINEFLIX = {

  /* --- Clé TMDB --------------------------------------------------------
     Clé API (v3) ou jeton d'accès (v4), obtenue sur
     https://www.themoviedb.org/settings/api

     Renseignée ici, elle vaut pour tout le monde : tes proches ouvrent
     l'app et ça marche, sans rien configurer. Elle est alors lisible dans
     le code source par qui va la chercher — c'est une clé de lecture
     seule sur un catalogue public, le pire risque est la consommation de
     quota, et elle se révoque en un clic. Laisse vide pour que chaque
     utilisateur saisisse la sienne.                                      */
  tmdbKey: '2c9624c3424d4588db0829ba94147694',

  /* --- Le serveur Jellyfin ---------------------------------------------
     Plusieurs adresses possibles, dans l'ordre de préférence. L'app les
     essaie une par une au démarrage et garde la première qui répond.

     Tout passe par le tailnet, aucun port n'est ouvert sur Internet.
     L'adresse ts.net vient en premier parce qu'elle est en HTTPS : servie
     en HTTPS, l'app ne peut pas sonder un Jellyfin en HTTP (contenu mixte),
     et le service worker exige de toute façon un contexte sécurisé.
     L'IP Tailscale reste en secours pour un accès en HTTP simple.        */
  jellyfinHosts: [
    // 'https://truenas87.<ton-tailnet>.ts.net:8443',   // via tailscale serve
    'http://100.95.13.53:30013'                         // Truenas87, IP Tailscale
  ],

  /* --- Supabase ---------------------------------------------------------
     Porte les comptes, la file de demandes partagée et le catalogue poussé
     par le NAS. Les deux valeurs se trouvent dans Supabase →
     Project Settings → API : « Project URL » et la clé « anon / publishable ».

     Cette clé est conçue pour vivre dans le client : ce qui protège les
     données, ce sont les règles RLS posées par supabase-cineflix.sql, pas le
     secret de la clé. La clé « service_role », elle, ne doit JAMAIS figurer
     ici — elle reste sur le NAS, dans la tâche d'export.

     Laisser vide fait retomber l'app en mode local : pas de comptes, les
     demandes restent sur l'appareil, le catalogue est lu dans un fichier.   */
  supabase: {
    url: 'https://tjvgexbeztavyyxigtzr.supabase.co',
    key: 'sb_publishable_1zhd_WaREneIP9F4SqaCtg__wDfIdSZ'
  },

  /* --- Notifications push -----------------------------------------------
     La clé PUBLIQUE d'envoi (VAPID) : elle identifie le serveur autorisé à
     notifier — sa jumelle PRIVÉE vit sur le NAS, dans la tâche d'export,
     et nulle part ailleurs. Vider ce champ masque le bouton dans le profil. */
  pushCle: 'BMRT0ZZ05smuTw641GZGQi_bo5kKP6G86j_d-qcLCs_hjc1BiTBYWGW5D5zTgqt1VzyegmCQNS17M_UPWmYHTMs',

  /* --- Catalogue --------------------------------------------------------
     Le fichier produit par outils-nas/export-jellyfin.py. Une adresse
     relative suffit s'il est déposé à côté de l'app.                     */
  catalogue: './cineflix.json',

  /* --- Région des dates de sortie ---------------------------------------
     Détermine les dates cinéma, numérique et Blu-ray affichées.          */
  region: 'FR',

  /* --- Nom affiché ------------------------------------------------------ */
  nom: 'Cinéflix'
};
