# Carte produit

Un outil pour comprendre et piloter le logiciel qu'on fait construire, sans lire le code :
on décrit son projet, l'outil en tire un arbre, puis le remplit à partir du dépôt GitHub.

## État d'avancement

- Étape 1 (faite) : description → questions → arbre vide, affiché comme le prototype.
- Étape 2 (faite) : connexion GitHub en lecture seule, états et preuves.
- Étape 3 : fiches complètes, écarts, prompts.
- Étape 4 : mise à jour, résumé des changements, corrections à la main.

## Lancer l'outil

```bash
npm install
npm start
```

Puis ouvrir http://localhost:3000.

Réglages, lus dans l'environnement et jamais écrits dans le code :

- `ANTHROPIC_API_KEY` : la clé de l'IA. Sans elle, l'outil tourne en mode démonstration avec un exemple fixe.
- `APP_PASSWORD` : mot de passe d'accès. À définir dès que l'outil est en ligne.
- `PORT` (3000 par défaut) et `DATA_DIR` (dossier du fichier de données, `data` par défaut).

## Vérifier

```bash
npm run check
```

## Organisation

- `reference/` : le prototype fait à la main, référence du rendu et du langage.
- `src/arbre.ts` : la forme de l'arbre et les règles qui décident de ce qui est affiché (testé).
- `src/etats.ts` : le contrôle des preuves et la décision des états (testé). L'IA propose, ce fichier décide.
- `src/github.ts` : la lecture du dépôt GitHub, en lecture seule.
- `src/lecture.ts` : l'enchaînement qui lit le dépôt et remplit l'arbre, avec cache.
- `src/ia.ts` : les appels à l'IA (questions, arbre, repérage, avis sur les cases).
- `src/serveur.ts`, `src/base.ts` : le serveur et le stockage (un fichier SQLite).
- `public/` : les écrans. `carte.js` et `carte.css` reprennent le prototype.
