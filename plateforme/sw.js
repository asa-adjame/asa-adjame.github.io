/* ══════════════════════════════════════════════════════════════════════════
   ASA PLATEFORME — service worker.

   Pourquoi il existe. La plateforme pèse 410 ko. À Adjamé, la coupure est la
   norme et pas l'incident : sans copie locale, ouvrir l'adresse sans réseau
   donne une page blanche, et toute la file d'attente durable qui se trouve
   derrière ne sert à rien puisque la page qui la porte ne se charge pas.

   C'est son seul rôle : garder une copie de la page pour pouvoir la servir
   sans réseau. Il ne met en cache AUCUNE donnée du club.

   c411f081583b est remplacé à la construction par l'empreinte du fichier
   produit. Un nouveau dépôt change l'empreinte, donc le nom du cache, donc
   l'ancienne copie est effacée : une mise à jour ne reste jamais coincée.
   ══════════════════════════════════════════════════════════════════════════ */

const CACHE = 'asa-plateforme-c411f081583b';

/* UNE seule entrée, et c'est volontaire.

   La version précédente en listait trois — './', './index.html' et le nom du
   fichier — qui pointent toutes vers la même page. Chacune étant une clé de
   cache distincte, l'installation téléchargeait 415 ko deux ou trois fois de
   suite. Mesuré : 830 ko transférés pour un fichier de 415. Sur un forfait
   mobile à Abidjan, ça se paie.

   On n'en garde qu'une, et on rattrape les autres adresses à la lecture : une
   requête de navigation qui ne trouve rien se voit servir cette page-là. */
/* « ./ » — le dossier lui-même — plutôt qu'un nom de fichier : l'entrée vaut
   alors quel que soit le nom publié, index.html compris, et elle sert de repli
   à toute requête de navigation.

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
      /* addAll échoue en bloc si un seul fichier manque ; on tolère.

         Le mode de cache n'est PAS un détail. Par défaut, c.add() se sert dans
         le cache HTTP du navigateur, où GitHub Pages laisse la page pendant
         dix minutes. Un appareil qui ouvre l'application juste après un dépôt
         mémorise alors l'ANCIENNE page dans un cache tout neuf — et comme le
         nom du cache vient de changer, l'ancienne copie a été effacée : la
         version périmée devient la seule. Vu en vrai sur Sniper le 28/09/2026,
         et ça se serait reproduit à CHAQUE mise à jour.

         Sniper corrige ça avec 'reload', qui ignore le cache HTTP. Mais
         'reload' interdit aussi la requête conditionnelle : la page vient
         d'être affichée, et l'installation la retélécharge intégralement.
         Mesuré ici : 830 ko transférés pour un fichier de 415.

         'no-cache' fait les deux. Il force une revalidation auprès du serveur
         — donc une page modifiée revient en 200 avec son nouveau corps, et le
         défaut du 28/09 reste corrigé — mais une page inchangée revient en 304
         et c'est la copie locale qui est rangée. Même garantie, moitié moins
         de données sur un forfait mobile. */
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

      /* Le cache d'abord : c'est la seule façon d'ouvrir sans réseau.

         Rien en cache pour cette adresse précise ? Si c'est une navigation —
         la racine du site, ou index.html — on sert la page qu'on a. C'est ce
         qui remplace les trois entrées de cache d'autrefois, sans payer trois
         téléchargements. */
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
    '<!DOCTYPE html><meta charset="utf-8"><title>ASA Plateforme</title>'
    + '<body style="font-family:system-ui;background:#051630;color:#EDF3FA;'
    + 'padding:40px;text-align:center">'
    + '<h1 style="color:#FFB246">ASA Plateforme</h1>'
    + '<p>Cette page n\'a pas encore été mise en mémoire sur cet appareil, '
    + 'et il n\'y a pas de réseau.</p>'
    + '<p style="color:#93AAC6;font-size:14px">Ouvre-la une fois avec du '
    + 'réseau : ensuite elle s\'ouvrira partout, même sans connexion.</p>',
    {headers: {'Content-Type': 'text/html; charset=utf-8'}, status: 503});
}
