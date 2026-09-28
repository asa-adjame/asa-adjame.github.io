/* ══════════════════════════════════════════════════════════════════════════
   ASA SNIPER — service worker.

   Pourquoi il existe. Tout le reste de l'application était pensé pour le
   hors-ligne : effectif en cache, file d'attente durable, vérification des
   QR sur l'appareil. Mais la PAGE elle-même avait besoin du réseau pour se
   charger. Dans un gymnase sans couverture, l'assistant ouvrait l'adresse et
   tombait sur une page blanche — toute la préparation ne servait à rien.

   Ce fichier corrige ça, et c'est son seul rôle : garder une copie de la
   page pour pouvoir la servir sans réseau.

   f381f3019039 est remplacé à la construction par l'empreinte du fichier
   produit. Un nouveau dépôt change l'empreinte, donc le nom du cache, donc
   l'ancienne copie est effacée : une mise à jour ne reste jamais coincée.
   ══════════════════════════════════════════════════════════════════════════ */

const CACHE = 'asa-sniper-f381f3019039';
const PAGES = ['./', './index.html', './asa-sniper.html'];

self.addEventListener('install', e => {
  /* On prend la main tout de suite : le gymnase peut être le prochain écran. */
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      /* addAll échoue en bloc si un seul fichier manque ; on tolère.

         cache: 'reload' n'est PAS un détail. Sans lui, c.add() se sert dans
         le cache HTTP du navigateur, où GitHub Pages laisse la page pendant
         dix minutes. Un appareil qui ouvre l'application juste après un dépôt
         mémorise alors l'ANCIENNE page dans un cache tout neuf — et comme le
         nom du cache vient de changer, l'ancienne copie a été effacée : la
         version périmée devient la seule. Vu en vrai le 28/09/2026. */
      Promise.all(PAGES.map(p =>
        c.add(new Request(p, {cache: 'reload'})).catch(() => null)))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(
        noms.filter(n => n.indexOf('asa-sniper-') === 0 && n !== CACHE)
            .map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request;

  /* On ne touche QU'À la page. Les appels à Supabase doivent passer par le
     réseau et échouer franchement quand il n'y a pas de réseau : c'est ce
     qui déclenche la reprise depuis le cache et la file d'attente. Les
     servir depuis un cache donnerait des réponses périmées silencieuses. */
  if (r.method !== 'GET') return;
  if (new URL(r.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(r).then(enCache => {
      /* Le réseau met la copie à jour en arrière-plan, sans faire attendre.

         Ici aussi on court-circuite le cache HTTP : 'no-cache' force une
         requête conditionnelle au serveur. Sans cela, la revalidation se
         contenterait de relire la copie périmée que le navigateur garde, et
         n'aurait jamais rien à revalider. On repart de r.url plutôt que de r
         parce qu'une requête de navigation ne se reconstruit pas telle quelle. */
      const frais = fetch(r.url, {cache: 'no-cache', credentials: 'same-origin'})
        .then(rep => {
        if (rep && rep.ok){
          const copie = rep.clone();
          caches.open(CACHE).then(c => c.put(r, copie)).catch(() => {});
        }
        return rep;
      }).catch(() => null);

      /* Le cache d'abord : c'est la seule façon d'ouvrir sans réseau. */
      return enCache || frais.then(rep => rep || new Response(
        '<!DOCTYPE html><meta charset="utf-8"><title>ASA Sniper</title>'
        + '<body style="font-family:system-ui;background:#04101F;color:#EDF3FA;'
        + 'padding:40px;text-align:center">'
        + '<h1 style="color:#FFB246">ASA Sniper</h1>'
        + '<p>Cette page n\'a pas encore été mise en mémoire sur cet appareil, '
        + 'et il n\'y a pas de réseau.</p>'
        + '<p style="color:#93AAC6;font-size:14px">Ouvre-la une fois avec du '
        + 'réseau : ensuite elle s\'ouvrira partout, même sans connexion.</p>',
        {headers: {'Content-Type': 'text/html; charset=utf-8'}, status: 503}));
    })
  );
});
