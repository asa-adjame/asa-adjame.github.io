/* ═══════════════════════════════════════════════════════════════════════════
   PLATEFORME ASA — service worker.

   Pourquoi il existe. La plateforme pèse 415 ko. À Adjamé, la coupure est la
   norme et pas l'incident : sans copie locale, ouvrir l'adresse sans réseau
   donne une page blanche, et toute la file d'attente durable qui se trouve
   derrière ne sert à rien puisque la page qui la porte ne se charge pas.

   C'est son seul rôle : garder une copie de la page pour pouvoir la servir
   sans réseau. Il ne met en cache AUCUNE donnée du club.

   Le nom du cache porte l'empreinte du fichier produit. Un nouveau dépôt la
   change, donc l'ancienne copie est effacée : une mise à jour ne reste
   jamais coincée.
   ═══════════════════════════════════════════════════════════════════════════ */

const CACHE = 'asa-plateforme-a0e0c35b1949';

/* « ./ » — le dossier lui-même — plutôt qu'un nom de fichier : l'entrée vaut
   alors quel que soit le nom publié, index.html compris, et elle sert de repli
   à toute requête de navigation. Une seule entrée, donc un seul
   téléchargement à l'installation.

   Ce « ./ » porte aussi LA PORTÉE, et c'est le point important. La plateforme
   est publiée dans son propre sous-dossier, pas à la racine, parce qu'ASA
   Sniper y a déjà son service worker : deux enregistrements sur la même portée
   se remplacent l'un l'autre, et Sniper perdrait son hors-ligne au gymnase.
   Un sous-dossier leur donne deux portées distinctes, et ils s'ignorent. */
const PAGE = './';
const PAGES = [PAGE];

self.addEventListener('install', e => {
  /* On prend la main tout de suite : le gymnase peut être le prochain écran. */
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      /* Le mode de cache n'est PAS un détail. Par défaut, c.add() se sert dans
         le cache HTTP du navigateur, où GitHub Pages laisse la page pendant
         dix minutes : un appareil qui ouvre l'application juste après un dépôt
         mémoriserait l'ANCIENNE page dans un cache tout neuf. Vu en vrai sur
         Sniper le 28/09/2026.

         'no-cache' force une revalidation : une page modifiée revient en 200
         avec son nouveau corps, une page inchangée en 304 — même garantie que
         'reload', moitié moins de données sur un forfait mobile. */
      Promise.all(PAGES.map(p =>
        c.add(new Request(p, {cache: 'no-cache'})).catch(() => null)))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(
        noms.filter(n => n.indexOf('asa-plateforme-') === 0 && n !== CACHE)
            .map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request;

  /* On ne touche QU'À la page. Les appels à Supabase doivent passer par le
     réseau et échouer franchement quand il n'y a pas de réseau : c'est ce qui
     déclenche la reprise de session depuis l'appareil et le remplissage de la
     file d'attente. Les servir depuis un cache donnerait des réponses périmées
     silencieuses — un effectif d'il y a trois semaines présenté comme à jour. */
  if (r.method !== 'GET') return;
  if (new URL(r.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(r).then(enCache => {
      /* Le réseau met la copie à jour en arrière-plan, sans faire attendre. */
      const frais = fetch(r.url, {cache: 'no-cache', credentials: 'same-origin'})
        .then(rep => {
          if (rep && rep.ok){
            const copie = rep.clone();
            caches.open(CACHE).then(c => c.put(r, copie)).catch(() => {});
          }
          return rep;
        }).catch(() => null);

      /* Le cache d'abord : c'est la seule façon d'ouvrir sans réseau. Rien pour
         cette adresse précise ? Si c'est une navigation, on sert la page
         qu'on a. */
      if (enCache) return enCache;
      if (r.mode === 'navigate'){
        return caches.match(PAGE).then(p => p || frais.then(rep => rep || horsLigne()));
      }
      return frais.then(rep => rep || horsLigne());
    })
  );
});

/* Ni cache ni réseau : on le dit, plutôt que de laisser une page blanche. */
function horsLigne(){
  return new Response(
    '<!DOCTYPE html><meta charset="utf-8"><title>Plateforme ASA</title>'
    + '<body style="font-family:system-ui;background:#051630;color:#EDF3FA;'
    + 'padding:40px;text-align:center">'
    + '<h1 style="color:#FFB246">Plateforme ASA</h1>'
    + '<p>Cette page n\'a pas encore été mise en mémoire sur cet appareil, '
    + 'et il n\'y a pas de réseau.</p>'
    + '<p style="color:#93AAC6;font-size:14px">Ouvre-la une fois avec du '
    + 'réseau : ensuite elle s\'ouvrira partout, même sans connexion.</p>',
    {headers: {'Content-Type': 'text/html; charset=utf-8'}, status: 503});
}
