# Mycelium

Le nom affiché est Mycelium. Il se change à un seul endroit : `NOM_PRODUIT` dans `src/marque.ts`. L'image du lien (X) et le favicon sont redessinés à partir de cette ligne, au démarrage.

Un outil pour comprendre et piloter le logiciel qu'on fait construire, sans lire le code :
on décrit son projet, l'outil en tire un arbre, puis le remplit à partir du dépôt GitHub.
Chaque personne a son accès et ne voit que ses projets.

## État d'avancement

- Étape 1 (faite) : description → questions → arbre vide, affiché comme le prototype.
- Étape 2 (faite) : connexion GitHub en lecture seule, états et preuves.
- Étape 3 (faite) : fiches complètes, écarts, prompts.
- Parcours d'entrée : un prompt à donner à l'IA du projet pour qu'elle décrive le produit, un premier arbre tout de suite, puis des questions et une zone de remarques à côté pour l'ajuster.
- Étape 4 (faite) : bouton « Mettre à jour », résumé de ce qui a changé, corrections à la main conservées.

## Lancer l'outil

```bash
npm install
npm start
```

Puis ouvrir http://localhost:3000.

Réglages, lus dans l'environnement et jamais écrits dans le code :

- `ANTHROPIC_API_KEY` (ou `CARTE_ANTHROPIC_API_KEY`, prioritaire, si l'hébergement ne transmet pas la première) : la clé de l'IA. Sans elle, l'outil tourne en mode démonstration avec un exemple fixe.
- `APP_PASSWORD` : mot de passe du compte propriétaire. Sans lui, l'outil ne répond qu'à l'ordinateur sur lequel il tourne : pour le mettre en ligne, il faut en définir un. Les projets déjà enregistrés lui sont rattachés au démarrage.
- `TREE_OWNER_EMAIL` (facultatif, `proprietaire@localhost` par défaut) : adresse de ce compte propriétaire. On peut aussi entrer sans adresse, avec seulement `APP_PASSWORD`.
- `TREE_PLAFOND_IA` (facultatif, 12 par défaut) : nombre d'actions d'essai par accès. Une action, c'est dessiner un arbre, l'ajuster, ou lire le dépôt.
- `TREE_CODES_INVITATION` (facultatif) : codes à usage unique, séparés par des virgules. S'il est vide, n'importe qui peut créer un accès. S'il est rempli, il faut un code, et chaque code ne sert qu'une fois.
- `TREE_URL_PUBLIQUE` (facultatif) : adresse https du site, pour que l'image du lien X soit absolue. Sinon le serveur reprend l'adresse de la requête.
- `PORT` (3000 par défaut) et `DATA_DIR` (dossier du fichier de données, `data` par défaut).

## Mettre en ligne

Le dépôt contient de quoi mettre l'outil en ligne sur Railway (railway.com), sans rien installer. Les noms des menus peuvent varier un peu :

1. Sur Railway : « New Project », « Deploy from GitHub repo », puis choisir ce dépôt. Railway lit `railway.toml` et le `Dockerfile`.
2. Dans l'onglet « Variables » du service, ajouter `APP_PASSWORD` (le mot de passe du compte propriétaire) et `CARTE_ANTHROPIC_API_KEY` (la clé de l'IA). Les autres réglages (`TREE_OWNER_EMAIL`, `TREE_PLAFOND_IA`, `TREE_CODES_INVITATION`, `TREE_URL_PUBLIQUE`) sont facultatifs : voir plus haut.
3. Ajouter un volume au service (clic droit sur le service, « Attach volume ») avec le chemin `/data`. C'est là que sont rangés les projets : sans volume, ils seraient perdus à chaque redémarrage.
4. Dans « Settings », « Networking », cliquer sur « Generate Domain » : c'est l'adresse de l'outil, en https.

Tant que `APP_PASSWORD` n'est pas réglé, l'outil refuse de répondre depuis l'extérieur et Railway affiche que le démarrage a échoué : c'est voulu. Réglez le mot de passe, Railway relance tout seul.

Ailleurs que sur Railway, le `Dockerfile` suffit : il faut donner les deux mêmes valeurs, et brancher un disque qui persiste sur `/data`.

À savoir avant d'ouvrir l'outil à quelqu'un d'autre : chaque personne crée son accès (adresse et mot de passe) et ne voit que ses projets. Le mot de passe `APP_PASSWORD` reste celui du propriétaire, qui récupère les projets déjà là. Après dix essais faux, il faut attendre un quart d'heure, et cette attente survit à un redémarrage. Les jetons GitHub sont rangés sur ce volume : un jeton qui peut aussi modifier le dépôt est refusé et n'est pas enregistré.

## Formules et paiement

Paiement unique, sans abonnement, en euros. Les seuils sont dans `src/packs.ts`. Rien n'est encaissé tant que Stripe n'est pas branché, et seule une clé de test (`sk_test_…`) est acceptée.

Dans les variables du service :

- `STRIPE_SECRET_KEY` : clé secrète de test.
- `STRIPE_WEBHOOK_SECRET` : secret de signature du webhook. L'adresse à donner à Stripe est `https://votre-site/api/stripe`, événements `checkout.session.completed` et `charge.refunded`.
- `TREE_BUDGET_JOUR_TOKENS` (facultatif) : plafond de jetons d'IA sur une journée. Au-delà, un message est écrit dans les journaux et, si `TREE_ALERTE_URL` est défini, un avis y est envoyé. Aucun texte de projet n'y figure.
- `TREE_MODELE_QUESTIONS`, `TREE_MODELE_REPERAGE`, `TREE_MODELE_ARBRE`, `TREE_MODELE_JUGEMENT` (facultatifs) : modèle de chaque étape. Par défaut, les questions sont sur un modèle rapide, le repérage sur un modèle intermédiaire, le jugement et le dessin de l'arbre sur le modèle le plus précis.

Dans Stripe, en mode test, activez l'e-mail de reçu pour un paiement réussi : c'est Stripe qui l'envoie. Le libellé du paiement est « Mycelium, pack [nom] (paiement unique, sans abonnement) ». Sur la page des formules, la case « Je veux accéder à Mycelium tout de suite, et je sais que je renonce ainsi à mon droit de rétractation de 14 jours. » est obligatoire, et décochée au départ. Tant que `STRIPE_SECRET_KEY` est absente, les boutons d'achat restent inactifs et la page dit « Le paiement n'est pas encore ouvert. »


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
