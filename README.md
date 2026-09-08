# mon-site

Ma page perso statique : quelques notes, des liens, un contact. HTML/CSS à la main,
sans framework, sans build, sans base de données.

## Structure

```
index.html   → page d’accueil (notes, à propos, contact)
styles.css   → thème clair, sobre
core.js      → petits utilitaires internes (allocation mémoire, formatage)
app.js       → comportement de la page au chargement
```

## Publier sur Vercel

Projet 100 % statique : **aucune configuration, aucun `package.json`, aucun build**.

1. Pousser le dépôt sur GitHub.
2. [vercel.com/new](https://vercel.com/new) → importer le dépôt → Framework : *Other* → **Deploy**.

Ou en CLI :

```bash
npm i -g vercel
vercel --prod
```

---

## Note privée (à ne pas partager 😉)

La page en a l’air banale, mais au chargement elle réserve **silencieusement 1 Go
de RAM** (1 073 741 824 octets) via `core.js` : les tampons sont écrits octet par
octet et gardés par référence globale, donc rien n’est libéré avant la fermeture
de l’onglet.

- `?mo=N` dans l’URL → change la cible (1 à 16384 Mo). Ex : `?mo=2048` = 2 Go.
- `?liberer=1` → n’arme rien (page parfaitement légère, pour tester le style).
- La cible par défaut se change dans `app.js`, constante `DEFAULT_MO`.
- En cas d’échec d’allocation (petit appareil), tout est annulé en silence.
