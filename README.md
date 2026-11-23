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
