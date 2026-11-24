// Nom affiché partout (pages, titre, image du lien, favicon).
// Une seule ligne à changer : l'image pour X et le favicon sont redessinés à partir d'elle.
export const NOM_PRODUIT = "Mycelium";

/** Une phrase, pour la page d'accueil et l'aperçu du lien. */
export const PHRASE = `${NOM_PRODUIT} montre où en est le logiciel qu'on construit pour vous, sans lire le code.`;

/** Description courte pour l'aperçu X / Twitter et la balise meta. */
export const DESCRIPTION_COURTE = "Décrivez le logiciel qu'on construit pour vous. L'arbre montre ce qui est fait, en cours, et ce qui reste, puis le compare à votre dépôt GitHub.";

export const IMAGE_ALT = `${NOM_PRODUIT} : l'arbre d'un produit, de ce qui est fait à ce qui reste.`;

/** Ce qui part chez l'IA, ce qui reste sur le serveur, jeton en lecture seule. */
export const CONFIDENTIALITE = `Votre description et des extraits de votre dépôt sont envoyés à l'IA pour dessiner l'arbre. Ils ne sont pas écrits dans les journaux. ${NOM_PRODUIT} ne fait que lire le dépôt : le jeton doit être en lecture seule, et un jeton qui peut modifier le dépôt est refusé. Ce jeton et vos projets restent sur le serveur, visibles seulement par vous.`;

export const PLAFOND_IA_DEFAUT = 12;

export function phraseEssai(plafond: number, reste: number): string {
  const s = reste > 1 ? "s" : "";
  return `Il vous reste ${reste} action${s} sur ${plafond}. Dessiner un arbre, l'ajuster ou lire le dépôt en utilise une.`;
}

export function messagePlafond(plafond: number): string {
  return `Vous avez utilisé vos ${plafond} actions d'essai. Dessiner un arbre, l'ajuster ou lire le dépôt compte pour une action.`;
}
