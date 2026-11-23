// Le suivi dans le temps : corrections faites à la main, et résumé de ce qui a changé entre deux lectures du dépôt.
// Rien ici n'appelle l'IA : tout se calcule en comparant l'arbre d'avant et l'arbre d'après.
import { titrePropre, type Arbre, type Case, type Etat } from "./arbre.ts";
import type { Changements } from "./lecture.ts";

export const ETATS: readonly Etat[] = ["done", "wip", "todo", "later", "out"];
const NOM: Record<Etat, string> = { done: "Débloqué", wip: "En cours", todo: "À débloquer", later: "Après cette version", out: "Hors dépôt" };

const propre = (s: string) => s.replace(/\s+/g, " ").trim();
const cle = (s: string) => propre(s).toLowerCase();
const cases = (a: Arbre): Case[] => a.familles.flatMap((f) => f.themes.flatMap((t) => t.cases));
/** L'état que l'outil a tiré du dépôt, correction à la main mise de côté. */
const lu = (c: Case): Etat => c.etatLu ?? c.etat;
const titreOrigine = (c: Case) => c.corrige?.avant.titre ?? c.titre;

export interface Saisie { etat?: unknown; titre?: unknown; aQuoiCaSert?: unknown }

/**
 * Corrige une case à la main : son état, son titre, ou son « à quoi ça sert ».
 * L'état lu dans le dépôt et le texte d'origine sont gardés à côté : la fiche montre toujours les deux, et on peut annuler.
 */
export function corrigerCase(c: Case, saisie: Saisie, maintenant = new Date().toISOString()): void {
  const cor = c.corrige ?? { etat: null, avant: { titre: c.titre, aQuoiCaSert: c.aQuoiCaSert }, le: maintenant };
  const etatOutil = lu(c);
  if (typeof saisie.titre === "string" && propre(saisie.titre)) c.titre = titrePropre(saisie.titre);
  if (typeof saisie.aQuoiCaSert === "string" && propre(saisie.aQuoiCaSert)) c.aQuoiCaSert = propre(saisie.aQuoiCaSert).slice(0, 400);
  if (typeof saisie.etat === "string" && (ETATS as readonly string[]).includes(saisie.etat)) cor.etat = saisie.etat === etatOutil ? null : (saisie.etat as Etat);
  // Revenir exactement à ce que disait l'outil, c'est ne plus avoir de correction.
  if (cor.etat === null && c.titre === cor.avant.titre && c.aQuoiCaSert === cor.avant.aQuoiCaSert) { annulerCorrection(c); return; }
  cor.le = maintenant;
  c.corrige = cor; c.etatLu = etatOutil; c.etat = cor.etat ?? etatOutil;
}

/** Retire la correction : la case redevient ce que l'outil avait écrit et lu. */
export function annulerCorrection(c: Case): void {
  if (c.corrige) { c.titre = c.corrige.avant.titre; c.aQuoiCaSert = c.corrige.avant.aQuoiCaSert; }
  c.etat = lu(c);
  delete c.corrige; delete c.etatLu;
}

/** À appeler juste avant une lecture du dépôt : rend une copie de l'arbre tel qu'il est affiché, et remet chaque case corrigée sur l'état lu par l'outil. */
export function avantLecture(arbre: Arbre): Arbre {
  const copie = structuredClone(arbre);
  for (const c of cases(arbre)) if (c.corrige) c.etat = lu(c);
  return copie;
}

/**
 * À appeler après chaque lecture du dépôt, avec la copie de l'arbre prise juste avant.
 * 1. Remet en place les corrections faites à la main : la lecture vient de recalculer les états, et de reconstruire les cases trouvées dans le dépôt.
 * 2. Rend le résumé de ce qui a changé, ou rien si c'était la première lecture.
 */
export function apresLecture(avant: Arbre, apres: Arbre, lectureDavant: string | null | undefined): Changements | null {
  const lignes: string[] = [];
  const anciennes = cases(avant);
  const parId = new Map(anciennes.map((c) => [c.id, c]));
  // Les cases trouvées dans le dépôt changent d'identifiant à chaque lecture : on les retrouve par leur titre d'origine.
  const duDepot = new Map(anciennes.filter((c) => c.origine === "depot").map((c) => [cle(titreOrigine(c)), c]));
  const retrouvees = new Set<Case>();

  for (const c of cases(apres)) {
    const vieille = c.origine === "depot" ? duDepot.get(cle(c.titre)) : parId.get(c.id);
    if (vieille) retrouvees.add(vieille);
    const cor = vieille?.corrige ?? null;
    if (cor) {
      if (c.origine === "depot") { cor.avant = { titre: c.titre, aQuoiCaSert: c.aQuoiCaSert }; c.titre = vieille!.titre; c.aQuoiCaSert = vieille!.aQuoiCaSert; }
      c.corrige = cor; c.etatLu = c.etat; c.etat = cor.etat ?? c.etat;
    }
    const nom = `« ${c.titre} »`;
    if (!vieille) { if (c.origine === "depot") lignes.push(`Trouvé dans le dépôt, sans être dans votre description : ${nom}.`); continue; }
    if (lu(vieille) !== lu(c)) {
      lignes.push(`${nom} : ${NOM[lu(vieille)]} → ${NOM[lu(c)]}.${cor?.etat ? ` Votre correction (${NOM[cor.etat]}) est conservée.` : ""}`);
    } else if (vieille.nonVerifie && !c.nonVerifie) lignes.push(`${nom} : l'outil a maintenant de quoi trancher (${NOM[lu(c)]}).`);
    else if (!vieille.nonVerifie && c.nonVerifie) lignes.push(`${nom} : l'outil n'arrive plus à trancher, la case passe en « non vérifié ».`);
    if (!vieille.ecart && c.ecart) lignes.push(`Nouvel écart avec votre description sur ${nom} : ${c.ecart.constat}`);
    if (vieille.ecart && !c.ecart) lignes.push(`L'écart signalé sur ${nom} a disparu.`);
  }
  for (const c of duDepot.values()) {
    if (retrouvees.has(c)) continue;
    lignes.push(`N'apparaît plus dans le dépôt : « ${c.titre} ».${c.corrige ? " Votre correction sur cette case n'a pas pu être reportée." : ""}`);
  }
  return lectureDavant ? { depuis: lectureDavant, lignes } : null;
}
