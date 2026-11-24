// Formules et limites. Un seul endroit : les seuils se règlent ici.

export type IdPack = "essentiel" | "suivi" | "studio" | "recharge";

export interface Formule {
  id: IdPack;
  nom: string;
  /** Prix en centimes d'euro. */
  prixCentimes: number;
  prixLancementCentimes?: number;
  placesLancement?: number;
  cartes: number;
  redessins: number;
  lectures: number;
  /** Fichiers lisibles au plus. La recharge reprend le plafond de la formule en cours, au moins celui d'un dépôt moyen. */
  fichiersMax: number;
  /** Durée. La recharge dure jusqu'à la fin de la formule en cours. */
  jours?: number;
  mois?: number;
  resume: string;
}

export const FICHIERS_DEPOT_MOYEN = 1000;

export const FORMULES: Record<IdPack, Formule> = {
  essentiel: {
    id: "essentiel", nom: "Essentiel", prixCentimes: 4900, prixLancementCentimes: 2900, placesLancement: 100,
    cartes: 1, redessins: 5, lectures: 6, fichiersMax: 300, jours: 60,
    resume: "Une carte, cinq redessins, six lectures. Dépôt jusqu'à 300 fichiers lisibles, pendant 60 jours.",
  },
  suivi: {
    id: "suivi", nom: "Suivi", prixCentimes: 9900,
    cartes: 1, redessins: 10, lectures: 10, fichiersMax: 1000, mois: 4,
    resume: "Une carte, dix redessins, dix lectures. Dépôt jusqu'à 1 000 fichiers lisibles, pendant 4 mois.",
  },
  studio: {
    id: "studio", nom: "Studio", prixCentimes: 19900,
    cartes: 2, redessins: 20, lectures: 10, fichiersMax: 2500, mois: 6,
    resume: "Deux cartes, vingt redessins, dix lectures. Dépôt jusqu'à 2 500 fichiers lisibles, pendant 6 mois.",
  },
  recharge: {
    id: "recharge", nom: "Recharge", prixCentimes: 3900,
    cartes: 0, redessins: 0, lectures: 5, fichiersMax: FICHIERS_DEPOT_MOYEN,
    resume: "Cinq lectures de plus, pour un dépôt moyen, jusqu'à la fin de la formule en cours.",
  },
};

export const RENONCIATION = "Je veux accéder à Mycelium tout de suite, et je sais que je renonce ainsi à mon droit de rétractation de 14 jours.";

export function formule(id: string): Formule | null {
  return id in FORMULES ? FORMULES[id as IdPack] : null;
}

/** La formule la moins chère qui couvre cette taille, recharge mise à part. */
export function formuleSuffisante(fichiers: number): Formule | null {
  return Object.values(FORMULES)
    .filter((f) => f.id !== "recharge" && f.fichiersMax >= fichiers)
    .sort((a, b) => a.prixCentimes - b.prixCentimes)[0] ?? null;
}

export function prixCentimes(f: Formule, essentielsDejaVendus: number): number {
  if (f.prixLancementCentimes != null && f.placesLancement != null && essentielsDejaVendus < f.placesLancement) return f.prixLancementCentimes;
  return f.prixCentimes;
}

export function echeance(depuis: Date, f: Formule): string {
  const d = new Date(depuis);
  if (f.jours) d.setUTCDate(d.getUTCDate() + f.jours);
  if (f.mois) d.setUTCMonth(d.getUTCMonth() + f.mois);
  return d.toISOString();
}

export function euros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function phraseSolde(s: { cartes: number; redessins: number; lectures: number; fichiersMax: number; expireLe: string | null }): string {
  const date = s.expireLe ? new Date(s.expireLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
  const c = (n: number, un: string, plus: string) => `${n} ${n > 1 ? plus : un}`;
  return `Il te reste ${c(s.cartes, "carte", "cartes")}, ${c(s.redessins, "redessin", "redessins")} et ${c(s.lectures, "lecture", "lectures")}. Dépôt jusqu'à ${s.fichiersMax.toLocaleString("fr-FR")} fichiers lisibles${date ? `, jusqu'au ${date}` : ""}.`;
}

export function suggestionTaille(fichiers: number, maximum: number): string {
  return `Ton dépôt est plus costaud que ton pack (${fichiers.toLocaleString("fr-FR")} fichiers, max ${maximum.toLocaleString("fr-FR")}). Passe au pack au-dessus pour qu'on le lise en entier.`;
}
