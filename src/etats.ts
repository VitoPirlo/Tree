// Le cœur de la confiance : c'est ce fichier, et pas l'IA, qui décide de l'état d'une case.
// L'IA propose un avis et des preuves ; ici chaque preuve est contrôlée contre le dépôt réel.
// Une preuve qui ne se vérifie pas est écartée, et sans preuve la case ne change pas d'état.
import type { Etat } from "./arbre.ts";

export type Avis = "fait" | "en_cours" | "pas_fait" | "incertain";

/** Une preuve telle que l'IA la propose, avant contrôle. */
export interface PreuveIA { type: "fichier" | "test" | "fusion" | "branche"; chemin: string; extrait: string; numero: number }

export interface DemandeFusion {
  numero: number; titre: string; auteur: string; etat: "ouverte" | "fusionnee" | "fermee";
  /** Date de fusion si fusionnée, sinon date de création (AAAA-MM-JJ). */
  date: string; branche: string; corps: string;
}

/** Ce qu'on sait du dépôt, lu directement sur GitHub. */
export interface Faits {
  brancheDefaut: string;
  chemins: Set<string>;
  /** Contenu des fichiers réellement lus. Un extrait ne se vérifie que dans un fichier lu. */
  contenus: Map<string, string>;
  fusions: Map<number, DemandeFusion>;
  branches: Set<string>;
}

/** Une preuve contrôlée, affichable sur la fiche. */
export type Preuve =
  | { type: "fichier" | "test"; chemin: string; extrait: string }
  | { type: "fusion"; numero: number; titre: string; auteur: string; date: string; etat: "fusionnee" | "ouverte" }
  | { type: "branche"; nom: string };

export interface Decision {
  etat: Etat;
  /** Vrai quand l'outil n'a pas pu trancher : la fiche le dit au lieu d'afficher un état incertain. */
  nonVerifie: boolean;
  /** Pour une case débloquée : un test a-t-il été trouvé ? */
  teste: boolean;
  preuves: Preuve[];
  /** Nombre de preuves proposées par l'IA et rejetées au contrôle. */
  ecartees: number;
}

const aplatir = (s: string) => s.replace(/\s+/g, " ").trim();
const EST_UN_TEST = /(^|[/_.-])(tests?|specs?|__tests__|e2e)([/_.-]|$)/i;
const EXTRAIT_MIN = 12;

/** Contrôle une preuve contre le dépôt. Rend null si elle ne tient pas. */
export function verifierPreuve(p: PreuveIA, faits: Faits): Preuve | null {
  if (p.type === "fichier" || p.type === "test") {
    const chemin = p.chemin.trim().replace(/^\.?\//, "");
    const contenu = faits.contenus.get(chemin);
    if (!faits.chemins.has(chemin) || contenu === undefined) return null;
    const extrait = aplatir(p.extrait);
    if (extrait.length < EXTRAIT_MIN || !aplatir(contenu).includes(extrait)) return null;
    return { type: p.type === "test" && EST_UN_TEST.test(chemin) ? "test" : "fichier", chemin, extrait };
  }
  if (p.type === "fusion") {
    const f = faits.fusions.get(p.numero);
    if (!f || f.etat === "fermee") return null;
    return { type: "fusion", numero: f.numero, titre: f.titre, auteur: f.auteur, date: f.date, etat: f.etat };
  }
  const nom = p.chemin.trim();
  if (!faits.branches.has(nom) || nom === faits.brancheDefaut) return null;
  // Une branche dont la demande de fusion est déjà fusionnée ou fermée n'est plus un chantier.
  for (const f of faits.fusions.values()) if (f.branche === nom && f.etat !== "ouverte") return null;
  return { type: "branche", nom };
}

const cle = (p: Preuve) => (p.type === "fusion" ? `f${p.numero}` : p.type === "branche" ? `b${p.nom}` : `c${p.chemin}|${p.extrait}`);

/**
 * Décide de l'état d'une case.
 * - Débloqué : l'IA la dit faite ET une preuve tient sur la branche principale (fichier, test, fusion fusionnée).
 * - En cours : un chantier est prouvé (branche, demande de fusion ouverte), ou un travail partiel est prouvé sur la branche principale.
 * - Sinon la case garde l'état tiré de la description. Si l'IA affirmait autre chose sans preuve, elle est marquée « non vérifié ».
 */
export function decider(base: Etat, avis: Avis, proposees: PreuveIA[], faits: Faits): Decision {
  const vues = new Set<string>();
  const preuves: Preuve[] = [];
  for (const p of proposees) {
    const v = verifierPreuve(p, faits);
    if (v && !vues.has(cle(v))) { vues.add(cle(v)); preuves.push(v); }
  }
  const ecartees = proposees.length - preuves.length;
  const surPrincipale = preuves.some((p) => p.type === "fichier" || p.type === "test" || (p.type === "fusion" && p.etat === "fusionnee"));
  const enChantier = preuves.some((p) => p.type === "branche" || (p.type === "fusion" && p.etat === "ouverte"));
  const teste = preuves.some((p) => p.type === "test");

  if (avis === "fait" && surPrincipale) return { etat: "done", nonVerifie: false, teste, preuves, ecartees };
  if ((avis === "fait" || avis === "en_cours") && (surPrincipale || enChantier)) return { etat: "wip", nonVerifie: false, teste, preuves, ecartees };
  if (avis === "pas_fait") return { etat: base, nonVerifie: false, teste: false, preuves: [], ecartees };
  return { etat: base, nonVerifie: true, teste: false, preuves: [], ecartees };
}
