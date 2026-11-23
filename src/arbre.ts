// Forme de l'arbre et règles de mise au propre de ce que rend l'IA.
// Tout ce qui décide d'un état ou d'une citation affichée passe par ce fichier, qui est testé.
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Preuve } from "./etats.ts";

export const EMBLEMES = [
  "donnees", "cerveau", "courrier", "ecran", "serveur", "outil",
  "megaphone", "cadenas", "paiement", "personnes", "graphique", "reglages",
] as const;

/** Ce que l'IA doit rendre pour les questions. */
export const QuestionsIA = z.object({
  questions: z.array(z.object({ question: z.string(), pourquoi: z.string() })),
});
export type QuestionsIA = z.infer<typeof QuestionsIA>;

/** Ce que l'IA doit rendre pour l'arbre. */
export const ArbreIA = z.object({
  produit: z.object({ nom: z.string(), resume: z.string() }),
  familles: z.array(z.object({
    titre: z.string(),
    description: z.string(),
    responsable: z.string(),
    embleme: z.enum(EMBLEMES),
    themes: z.array(z.object({
      titre: z.string(),
      cases: z.array(z.object({
        titre: z.string(),
        aQuoiCaSert: z.string(),
        horizon: z.enum(["version", "apres", "hors_depot"]),
        citation: z.string(),
      })),
    })),
  })),
});
export type ArbreIA = z.infer<typeof ArbreIA>;

/** États d'une case. À l'étape 1, seuls les trois derniers existent : rien n'est vérifié. */
export type Etat = "done" | "wip" | "todo" | "later" | "out";

export interface Case {
  id: string;
  titre: string;
  aQuoiCaSert: string;
  ouOnEnEst: string;
  etat: Etat;
  /** Phrase de la description dont la case découle, seulement si elle s'y trouve vraiment. */
  citation: string | null;
  /** État tiré de la description seule. Sert de repli quand le dépôt ne prouve rien. */
  base: Etat;
  /** Vrai quand l'outil n'a pas pu trancher : la fiche l'annonce. */
  nonVerifie: boolean;
  /** Pour une case débloquée : un test a-t-il été trouvé ? */
  teste: boolean;
  /** Preuves contrôlées dans le dépôt. */
  preuves: Preuve[];
  /** D'où vient la case : de la description, ou d'une chose trouvée dans le dépôt dont la description ne parle pas. */
  origine: "description" | "depot";
  /** Deux phrases sur ce qui existe (case débloquée ou en cours). */
  commentCaMarche: string;
  /** Qui doit faire quoi, tâche par tâche. */
  taches: { qui: string; quoi: string }[];
  /** Vrai si ce n'est pas du code à écrire : démarche, décision, réglage chez un prestataire. */
  horsCode: boolean;
  /** Décision à prendre avant de coder, s'il y en a une. */
  decision: string;
  /** Ce que la description demande et que le dépôt fait autrement. */
  ecart: Ecart | null;
  /** Prompt prêt à copier, pour une case à débloquer qui est du code. */
  prompt: string | null;
}
export interface Ecart { citation: string | null; constat: string }
export const FICHE_VIDE = { origine: "description" as const, commentCaMarche: "", taches: [], horsCode: false, decision: "", ecart: null, prompt: null };
export interface Theme { id: string; titre: string; cases: Case[] }
export interface Famille {
  id: string; titre: string; description: string; responsable: string | null;
  embleme: (typeof EMBLEMES)[number]; themes: Theme[];
}
export interface Arbre { produit: { nom: string; resume: string }; familles: Famille[] }
export interface Question { question: string; pourquoi: string }

const id = () => randomUUID().slice(0, 8);
const propre = (s: string) => s.replace(/\s+/g, " ").trim();

/** Un titre tient sur trois lignes au plus dans une case : on coupe au mot près. */
export function titrePropre(s: string, max = 60): string {
  const t = propre(s).replace(/[.。]+$/, "");
  if (t.length <= max) return t;
  const coupe = t.slice(0, max);
  const dernier = coupe.lastIndexOf(" ");
  return (dernier > max / 2 ? coupe.slice(0, dernier) : coupe).trimEnd() + "…";
}

const aplatir = (s: string) =>
  s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[«»“”"]/g, "").replace(/\s+/g, " ").trim();

/** Rend la citation seulement si elle figure mot pour mot dans la description. Sinon rien : pas de phrase inventée. */
export function citationVerifiee(citation: string, description: string): string | null {
  const c = propre(citation).replace(/^[«"“]\s*|\s*[»"”]$/g, "");
  if (c.length < 8) return null;
  return aplatir(description).includes(aplatir(c)) ? c : null;
}

const SANS_DEPOT: Record<"version" | "apres" | "hors_depot", { etat: Etat; texte: string }> = {
  version: { etat: "todo", texte: "Pas encore vérifié : aucun dépôt n'est connecté." },
  apres: { etat: "later", texte: "Prévu après cette version, d'après votre description." },
  hors_depot: { etat: "out", texte: "Ne se fait pas dans le code : rien à vérifier dans un dépôt." },
};

/** Entre 0 et 5 questions, sans doublon ni question vide. */
export function normaliserQuestions(brut: QuestionsIA): Question[] {
  const vues = new Set<string>();
  const out: Question[] = [];
  for (const q of brut.questions) {
    const question = propre(q.question);
    const cle = aplatir(question);
    if (!question || vues.has(cle)) continue;
    vues.add(cle);
    out.push({ question, pourquoi: propre(q.pourquoi) });
    if (out.length === 5) break;
  }
  return out;
}

/** Transforme la réponse de l'IA en arbre affichable. Sans dépôt, aucune case ne peut être débloquée ni en cours. */
export function normaliserArbre(brut: ArbreIA, description: string): Arbre {
  const familles: Famille[] = [];
  for (const f of brut.familles) {
    const themes: Theme[] = [];
    for (const t of f.themes) {
      const cases: Case[] = [];
      const titres = new Set<string>();
      for (const c of t.cases) {
        const titre = titrePropre(c.titre);
        if (!titre || titres.has(aplatir(titre))) continue;
        titres.add(aplatir(titre));
        const regle = SANS_DEPOT[c.horizon];
        cases.push({
          id: id(), titre, aQuoiCaSert: propre(c.aQuoiCaSert), ouOnEnEst: regle.texte,
          etat: regle.etat, citation: citationVerifiee(c.citation, description),
          base: regle.etat, nonVerifie: false, teste: false, preuves: [], ...FICHE_VIDE,
        });
      }
      if (cases.length) themes.push({ id: id(), titre: titrePropre(t.titre, 40), cases });
    }
    if (themes.length) {
      familles.push({
        id: id(), titre: titrePropre(f.titre, 40), description: propre(f.description),
        responsable: propre(f.responsable) || null, embleme: f.embleme, themes,
      });
    }
  }
  if (!familles.length) throw new Error("L'arbre généré est vide.");
  return { produit: { nom: titrePropre(brut.produit.nom, 40) || "Mon produit", resume: propre(brut.produit.resume) }, familles };
}
