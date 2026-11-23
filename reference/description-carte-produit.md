Carte produit est un outil pour un fondateur ou un dirigeant qui ne lit pas le code, et qui veut comprendre et piloter le logiciel qu'il fait construire.

Il colle la description de son projet, en texte libre. L'outil lui pose 3 à 5 questions pour lever les doutes, puis dessine un arbre de son produit : le produit, ses grandes familles, des thèmes, et des cases. Chaque case est une chose précise que le produit fait pour quelqu'un. Tout est écrit sans jargon technique.

Ensuite il connecte son dépôt GitHub. L'outil lit le dépôt en lecture seule, il n'écrit jamais dedans. Il donne à chaque case un état : débloqué, en cours, à débloquer, après cette version, ou hors dépôt. Aucun état n'est donné sans preuve vérifiée : en cas de doute, la fiche dit « non vérifié ». Chaque fiche montre les preuves trouvées dans le dépôt, et la phrase de la description dont la case découle.

L'outil signale les écarts entre la description et ce qui est réellement construit, et aussi ce qui a été construit sans que la description le demande. Pour chaque case à débloquer, il prépare un prompt prêt à copier dans un outil de développement.

Un bouton « Mettre à jour » relit le dépôt et résume ce qui a changé depuis la dernière lecture. Le fondateur peut corriger une case à la main, et ses corrections sont conservées à la mise à jour suivante.

L'accès à l'outil est protégé par un mot de passe. La description du projet et le contenu du dépôt ne sont jamais écrits dans les journaux.

Hors périmètre pour cette version : les comptes pour plusieurs utilisateurs, et les dépôts ailleurs que sur GitHub. Maxime décide du produit, des agents IA écrivent le code.
