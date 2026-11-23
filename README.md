# Carte produit

Un outil pour comprendre et piloter le logiciel qu'on fait construire, sans lire le code :
on décrit son projet, l'outil en tire un arbre, puis le remplit à partir du dépôt GitHub.

## État d'avancement

- Étape 1 (faite) : description → questions → arbre vide, affiché comme le prototype.
- Étape 2 (faite) : connexion GitHub en lecture seule, états et preuves.
- Étape 3 (faite) : fiches complètes, écarts, prompts.
- Étape 4 (faite) : bouton « Mettre à jour », résumé de ce qui a changé, corrections à la main conservées.

## Lancer l'outil

```bash
npm install
npm start
```

Puis ouvrir http://localhost:3000.

Réglages, lus dans l'environnement et jamais écrits dans le code :

- `ANTHROPIC_API_KEY` (ou `CARTE_ANTHROPIC_API_KEY`, prioritaire, si l'hébergement ne transmet pas la première) : la clé de l'IA. Sans elle, l'outil tourne en mode démonstration avec un exemple fixe.
- `APP_PASSWORD` : mot de passe d'accès. Sans lui, l'outil ne répond qu'à l'ordinateur sur lequel il tourne : pour le mettre en ligne, il faut en définir un.
- `PORT` (3000 par défaut) et `DATA_DIR` (dossier du fichier de données, `data` par défaut).

## Mettre en ligne

Le dépôt contient de quoi mettre l'outil en ligne sur Render (render.com), sans rien installer :

1. Sur Render : « New », « Blueprint », puis choisir ce dépôt. Render lit `render.yaml`.
2. Render demande deux valeurs : `APP_PASSWORD` (le mot de passe que vous choisissez pour entrer dans l'outil) et `CARTE_ANTHROPIC_API_KEY` (la clé de l'IA).
3. Valider. Quelques minutes plus tard, l'outil est à l'adresse que Render affiche, en https.

Ce que cela met en place : un service payant (offre « starter », avec un disque de 1 Go où sont rangés les projets). Sans disque, les projets seraient perdus à chaque redémarrage.

Ailleurs que sur Render, le `Dockerfile` suffit : il faut donner les deux mêmes valeurs, et brancher un disque qui persiste sur `/data`.

À savoir avant d'ouvrir l'outil à quelqu'un d'autre : il n'y a qu'un seul mot de passe, partagé ; après dix essais faux, il faut attendre un quart d'heure. Les jetons GitHub que vous collez dans l'outil sont rangés sur ce disque : donnez toujours un jeton en lecture seule.

## Vérifier

```bash
npm run check
```

## Organisation

- `reference/` : le prototype fait à la main, référence du rendu et du langage, et la description de l'outil lui-même, qui sert à l'essayer sur ce dépôt.
- `src/arbre.ts` : la forme de l'arbre et les règles qui décident de ce qui est affiché (testé).
- `src/etats.ts` : le contrôle des preuves et la décision des états (testé). L'IA propose, ce fichier décide.
- `src/github.ts` : la lecture du dépôt GitHub, en lecture seule.
- `src/lecture.ts` : l'enchaînement qui lit le dépôt et remplit l'arbre, avec cache.
- `src/suivi.ts` : les corrections à la main et le résumé de ce qui a changé entre deux lectures (testé, sans appel à l'IA).
- `src/ia.ts` : les appels à l'IA (questions, arbre, repérage, avis sur les cases).
- `src/serveur.ts`, `src/base.ts` : le serveur et le stockage (un fichier SQLite).
- `public/` : les écrans. `carte.js` et `carte.css` reprennent le prototype.
