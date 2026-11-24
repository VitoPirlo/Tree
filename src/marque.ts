// Nom affiché partout (pages, titre, image du lien, favicon).
// Une seule ligne à changer : l'image pour X et le favicon sont redessinés à partir d'elle.
export const NOM_PRODUIT = "Mycelium";

/**
 * Textes définitifs de la page d'accueil. Tout se remplace ici.
 */
export const ACCUEIL = {
  phrase: "Vois où en est ton produit. Et ton dev.",
  descriptionCourte: "Une carte simple pour les fondateurs qui ne lisent pas le code. Tu décris le produit, tu relies GitHub en lecture seule, tu vois ce qui est fait, ce qui avance, et ce qu'il reste à faire.",
  imageAlt: `${NOM_PRODUIT} : la carte d'un produit, de ce qui est fait à ce qui reste.`,
  confidentialite: `Ta description et des extraits de ton dépôt sont envoyés à l'IA pour dessiner la carte. Ils ne sont pas écrits dans les journaux. ${NOM_PRODUIT} ne fait que lire le dépôt : l'accès GitHub doit être en lecture seule, et un accès qui peut le modifier est refusé. Cet accès et tes projets restent sur le serveur, visibles seulement par toi.`,
  sousTitre: "Une carte simple, pour les fondateurs qui ne lisent pas le code. Tu décris ce que tu fais construire. Mycelium compare ça à ton dépôt GitHub, en lecture seule, et te montre ce qui est fait, ce qui avance, et ce qu'il reste à faire. Sans ouvrir le code. Sans jouer les détectives.",
  mentionApercu: "Voici à quoi ressemble une carte. Le produit au centre, puis les chantiers, les sujets, les cases. (C'est un exemple.)",
  legende: [
    "Fait, c'est dans le dépôt",
    "En cours, le travail a commencé",
    "À débloquer, prévu mais quelque chose bloque",
    "Plus tard, pas pour maintenant",
    "Hors dépôt, prévu mais introuvable dans le code",
  ] as const,
  etapes: [
    ["Tu décris le produit.", "Avec tes mots, ou en collant le texte d'une IA qui connaît déjà le projet. Mycelium pose ensuite 3 à 5 questions pour préciser la carte. Une réponse vide ? Pas de souci : l'outil ne supposera rien."],
    ["La carte se dessine.", "Le produit, ses chantiers, leurs sujets, puis les cases. Chaque case est classée : fait, en cours, à débloquer, plus tard, ou hors dépôt."],
    ["Tu relies GitHub, en lecture seule.", "Chaque case est vérifiée dans le dépôt. Un accès qui pourrait le modifier est refusé, et n'est pas enregistré. Tu vois les écarts avec ce qui était prévu, qui doit faire quoi, et un texte à coller dans l'outil de ton dev."],
  ] as const,
  noteEssai: "Dessiner une carte, l'ajuster ou lire le dépôt en utilise une.",
  voirTitre: "Ce que tu vois sur la carte",
  voir: [
    "Une fois la carte dessinée et le dépôt relié, tu n'as pas à ouvrir le code.",
    "Tu vois où en est chaque case, et ce qui s'écarte de ce qui était prévu. Mycelium te dit qui peut s'en charger, et te file un texte à coller dans l'outil de ton dev.",
    "Quand le dépôt a avancé, « Mettre à jour » le relit et résume ce qui a changé.",
    "Les preuves viennent du dépôt. Mycelium n'invente pas de citation : s'il ne trouve pas, la case reste hors dépôt ou à débloquer. Pas de « c'est fait » au doigt mouillé.",
  ],
  donneesTitre: "On lit. On n'écrit pas.",
  donneesIntro: "Mycelium lit le dépôt, il ne l'écrit pas. Voici précisément ce qui circule.",
  donnees: [
    "Ta description, et des extraits de ton dépôt, sont envoyés à l'IA pour dessiner et tenir à jour la carte.",
    "Ces textes ne sont pas écrits dans les journaux du serveur.",
    "L'accès à GitHub doit être en lecture seule. Un accès qui peut modifier le dépôt est refusé, et n'est pas enregistré.",
    "Cet accès et tes projets restent sur le serveur, visibles seulement par toi. Chaque accès ne voit que ses propres projets.",
  ],
  pourQuiTitre: "Pour qui c'est fait",
  pourQui: [
    "Pour les fondateurs no-code, en français, qui bossent seuls ou avec un dev, et qui en ont assez de demander « ça en est où ? ».",
    "Tu n'as pas besoin de lire le code. Juste une description du produit, et un dépôt GitHub à relier en lecture seule.",
  ],
  faq: [
    ["Faut-il savoir lire le code ?", "Non. Tu décris le produit avec tes mots, ou tu colles un texte préparé par une IA qui connaît déjà le projet. Mycelium en fait une carte lisible, puis vérifie chaque case dans le dépôt."],
    ["Mycelium peut-il modifier mon dépôt GitHub ?", "Non. Lecture seule, point final. Un accès qui pourrait modifier le dépôt est refusé, et n'est pas enregistré."],
    ["Qu'est-ce qui est envoyé à l'IA ?", "Ta description, et des extraits de ton dépôt, pour dessiner la carte et la tenir à jour. Ces textes ne sont pas écrits dans les journaux. Tes projets restent sur le serveur, visibles seulement par toi."],
    ["Je peux mettre la carte à jour plus tard ?", "Oui. « Mettre à jour » relit le dépôt et résume ce qui a changé. Chaque lecture compte pour une action."],
    ["Qui peut voir mes projets ?", "Chaque accès ne voit que ses propres projets. L'accès GitHub et tes projets restent sur le serveur, visibles seulement par toi."],
  ] as const,
  faqEssaiQuestion: "C'est quoi une action d'essai ?",
  ctaTitre: "À toi de jouer.",
  ctaIntro: "Crée un accès, décris ton produit, et vois ta première carte pousser.",
};

export const PHRASE = ACCUEIL.phrase;
export const DESCRIPTION_COURTE = ACCUEIL.descriptionCourte;
export const IMAGE_ALT = ACCUEIL.imageAlt;
export const CONFIDENTIALITE = ACCUEIL.confidentialite;

export const PLAFOND_IA_DEFAUT = 12;

export function phraseEssai(plafond: number, reste: number): string {
  const s = reste > 1 ? "s" : "";
  return `Il te reste ${reste} action${s} sur ${plafond}. ${ACCUEIL.noteEssai}`;
}

export function messagePlafond(plafond: number): string {
  return `Tu as utilisé tes ${plafond} actions d'essai. ${ACCUEIL.noteEssai}`;
}

/** Textes bruts injectés dans la page d'accueil. Tout est dans ACCUEIL. */
export function textesAccueil(plafond: number): Record<string, string> {
  const [e1, e2, e3] = ACCUEIL.etapes;
  const [d1, d2, d3, d4] = ACCUEIL.donnees;
  const faq = ACCUEIL.faq;
  return {
    PHRASE: ACCUEIL.phrase,
    DESCRIPTION: ACCUEIL.descriptionCourte,
    IMAGE_ALT: ACCUEIL.imageAlt,
    CONFIDENTIALITE: ACCUEIL.confidentialite,
    SOUS_TITRE: ACCUEIL.sousTitre,
    MENTION: ACCUEIL.mentionApercu,
    LEG1: ACCUEIL.legende[0], LEG2: ACCUEIL.legende[1], LEG3: ACCUEIL.legende[2], LEG4: ACCUEIL.legende[3], LEG5: ACCUEIL.legende[4],
    ETAPE1_T: e1[0], ETAPE1_X: e1[1],
    ETAPE2_T: e2[0], ETAPE2_X: e2[1],
    ETAPE3_T: e3[0], ETAPE3_X: e3[1],
    NOTE: `L'essai, c'est ${plafond} actions. ${ACCUEIL.noteEssai}`,
    VOIR_TITRE: ACCUEIL.voirTitre,
    VOIR1: ACCUEIL.voir[0], VOIR2: ACCUEIL.voir[1], VOIR3: ACCUEIL.voir[2], VOIR4: ACCUEIL.voir[3],
    DONNEES_TITRE: ACCUEIL.donneesTitre,
    DONNEES_INTRO: ACCUEIL.donneesIntro,
    PUCE1: d1, PUCE2: d2, PUCE3: d3, PUCE4: d4,
    POURQUI_TITRE: ACCUEIL.pourQuiTitre,
    POURQUI: ACCUEIL.pourQui[0],
    POURQUI2: ACCUEIL.pourQui[1],
    FAQ1_Q: faq[0][0], FAQ1_R: faq[0][1],
    FAQ2_Q: faq[1][0], FAQ2_R: faq[1][1],
    FAQ3_Q: faq[2][0], FAQ3_R: faq[2][1],
    FAQ_ESSAI_Q: ACCUEIL.faqEssaiQuestion,
    FAQ_ESSAI_R: `L'essai, c'est ${plafond} actions. ${ACCUEIL.noteEssai}`,
    FAQ_ESSAI_SUITE: "",
    CTA_LIEN: "",
    FAQ4_Q: faq[3][0], FAQ4_R: faq[3][1],
    FAQ5_Q: faq[4][0], FAQ5_R: faq[4][1],
    CTA_TITRE: ACCUEIL.ctaTitre,
    CTA_TEXTE: `${ACCUEIL.ctaIntro} L'essai, c'est ${plafond} actions. 🍄`,
    PLAFOND: String(plafond),
  };
}
