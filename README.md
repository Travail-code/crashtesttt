# crash(1 Go) 💣

Ce site réserve **exactement 1 Go (1 073 741 824 octets = 1024 × 1024 × 1024)** de mémoire dès qu’on l’ouvre dans un navigateur — sans clic, sans serveur, sans build.

## Comment c’est fait

| Étape | Détail |
|---|---|
| Réservation | Des `ArrayBuffer` couvrant exactement 1 073 741 824 octets sont alloués (`core.js`) |
| Écriture | Chaque octet est rempli (`memset`) → la mémoire est réellement consommée par le processus, pas seulement réservée virtuellement |
| Maintien | Les tampons sont gardés par référence globale → le ramasse-miettes ne peut rien libérer |
| Preuve | Taille totale vérifiée + relecture de 512 échantillons aléatoires |
| Libération | Fermeture de l’onglet, ou bouton « Libérer la mémoire » |

**« Exact »** signifie que l’allocation fait précisément 1 073 741 824 octets. Les compteurs du navigateur
(Gestionnaire des tâches, `performance.memory`) ajoutent le poids du moteur JS (quelques Mo) :
ils afficheront ≈ 1 Go ou un peu plus, jamais moins.

## Vérifier soi-même

Chrome → `⋮` → **Plus d’outils** → **Gestionnaire des tâches** → colonne **Mémoire** pour cet onglet.

## Personnalisation

- `?mo=256` dans l’URL → réserve 256 Mo au lieu de 1 Go (utile sur petit appareil).
- `?mo=2048` → 2 Go, etc. (plafond : 16384 Mo).

## Déployer sur Vercel

Projet 100 % statique : **aucune configuration, aucun `package.json`, aucun build**.

Option A — interface web (recommandée) :
1. Pousser ce dépôt sur GitHub.
2. Aller sur [vercel.com/new](https://vercel.com/new), importer le dépôt GitHub.
3. Framework : *Other* (détection automatique) → **Deploy**.

Option B — bouton magique (déploie un clone du dépôt public) :

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FTravail-code%2Fcrash)

Option C — CLI :

```bash
npm i -g vercel
vercel        # aperçu
vercel --prod # production
```

## Structure

```
index.html   → page (gauge + explications)
styles.css   → habillage
core.js      → logique pure : allocation exacte, memset, vérification (testable en Node)
app.js       → interface : armement automatique au chargement
```

## Test rapide de la logique (Node)

```bash
node -e "
const core = require('./core.js');
const chunks = core.allocateExactly(24 * 1024 * 1024, { chunkSize: 4 * 1024 * 1024 });
console.log('octets :', core.totalBytes(chunks));          // 25165824
console.log('blocs  :', chunks.length);                    // 6
console.log('vérif  :', JSON.stringify(core.sampleVerify(chunks, 200)));
"
```
