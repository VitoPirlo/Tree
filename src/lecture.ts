// Lecture du dépôt et remplissage de l'arbre.
// Pour maîtriser le coût, on n'envoie jamais tout le dépôt à l'IA :
//   1. la structure, la documentation, les branches et les demandes de fusion, pour repérer où regarder ;
//   2. puis, famille par famille, seulement les fichiers repérés.
// Ce qui n'a pas changé depuis la dernière lecture est repris du cache.
import { createHash } from "node:crypto";
import type { Arbre, Case, Famille } from "./arbre.ts";
import { decider, type Avis, type DemandeFusion, type Faits, type PreuveIA } from "./etats.ts";
import type { Depot, Fichier, InfoDepot } from "./github.ts";

export interface CaseRef { ref: string; titre: string; aQuoiCaSert: string; citation: string }
export interface Texte { chemin: string; texte: string }
export interface Pistes { ref: string; fichiers: string[]; fusions: number[]; branches: string[] }
export interface Verdict { ref: string; avis: Avis; ouOnEnEst: string; preuves: PreuveIA[] }

export interface ContextePlan { description: string; cases: CaseRef[]; chemins: string[]; docs: Texte[]; branches: string[]; fusions: DemandeFusion[] }
export interface ContexteJugement { description: string; famille: string; cases: (CaseRef & Pistes)[]; fichiers: Texte[]; fusions: DemandeFusion[]; branches: string[]; brancheDefaut: string }

/** La partie de l'IA dont la lecture a besoin. */
export interface IALecture {
  planifier(c: ContextePlan): Promise<{ cases: Pistes[] }>;
  juger(c: ContexteJugement): Promise<{ cases: Verdict[] }>;
}
export interface Cache { lire(cle: string): string | null; ecrire(cle: string, valeur: string): void }

// Change quand les consignes données à l'IA changent, pour ne pas resservir d'anciennes réponses.
const VERSION = "lecture-1";
const MAX_CHEMINS = 2500, MAX_TAILLE = 200_000, MAX_ENVOI = 8000, MAX_DOC = 6000;
const FICHIERS_PAR_CASE = 4, FICHIERS_PAR_FAMILLE = 30;
const IGNORES = /(^|\/)(node_modules|vendor|dist|build|\.git|\.next|__pycache__|\.venv|venv|coverage)\//;
const ILLISIBLES = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|woff2?|ttf|eot|mp[34]|mov|lock|min\.js|map|sqlite|bin)$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock)$/i;
const DOCS = /^(readme|agents|contributing|claude)(\.[\w-]+)?$/i;

const hache = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const couper = (s: string, max: number) => (s.length > max ? s.slice(0, max) + "\n[… fichier coupé ici]" : s);

async function avecCache<T>(cache: Cache, cle: string, calcul: () => Promise<T>): Promise<T> {
  const garde = cache.lire(cle);
  if (garde) return JSON.parse(garde) as T;
  const valeur = await calcul();
  cache.ecrire(cle, JSON.stringify(valeur));
  return valeur;
}

export interface ResultatLecture { arbre: Arbre; depot: InfoDepot & { luLe: string; fichiersIgnores: number } }

export async function lireDepot(
  entree: { description: string; arbre: Arbre }, depot: Depot, ia: IALecture, cache: Cache, progres: (message: string) => void = () => {},
): Promise<ResultatLecture> {
  progres("Lecture de la structure du dépôt…");
  const info = await depot.info();
  const [tous, branches, fusions] = await Promise.all([depot.fichiers(info.sha), depot.branches(), depot.fusions()]);
  const lisibles = tous.filter((f) => !IGNORES.test(f.chemin) && !ILLISIBLES.test(f.chemin) && f.taille <= MAX_TAILLE);
  const retenus = lisibles.slice(0, MAX_CHEMINS);
  const parChemin = new Map<string, Fichier>(retenus.map((f) => [f.chemin, f]));

  const contenus = new Map<string, string>();
  const lire = async (chemin: string) => {
    const f = parChemin.get(chemin);
    if (!f) return;
    if (!contenus.has(chemin)) contenus.set(chemin, await avecCache(cache, `fichier:${f.sha}`, () => depot.contenu(f.sha)));
  };

  // Les règles de travail et la documentation du dépôt : peu de fichiers, très parlants.
  const cheminsDocs = retenus.filter((f) => DOCS.test(f.chemin) || /^docs\/[^/]+\.md$/i.test(f.chemin)).slice(0, 8).map((f) => f.chemin);
  await Promise.all(cheminsDocs.map(lire));
  const docs = cheminsDocs.map((chemin) => ({ chemin, texte: couper(contenus.get(chemin)!, MAX_DOC) }));

  // Chaque case reçoit une référence courte (c1, c2…) : moins cher, et l'IA ne peut pas se tromper d'identifiant.
  const refs = new Map<string, Case>();
  const refsParFamille = new Map<Famille, CaseRef[]>();
  let n = 0;
  for (const f of entree.arbre.familles) {
    const liste: CaseRef[] = [];
    for (const t of f.themes) for (const c of t.cases) {
      if (c.base === "out") continue; // ce qui ne se fait pas dans le code ne se cherche pas dans le dépôt
      const ref = `c${++n}`;
      refs.set(ref, c);
      liste.push({ ref, titre: c.titre, aQuoiCaSert: c.aQuoiCaSert, citation: c.citation ?? "" });
    }
    refsParFamille.set(f, liste);
  }
  const toutesRefs = [...refsParFamille.values()].flat();

  progres("Repérage des endroits à lire pour chaque case…");
  const empreinteDepot = hache([info.sha, branches, fusions.map((f) => [f.numero, f.etat, f.titre])]);
  const plan = await avecCache(cache, `plan:${hache([VERSION, empreinteDepot, entree.description, toutesRefs])}`, () =>
    ia.planifier({ description: entree.description, cases: toutesRefs, chemins: retenus.map((f) => f.chemin), docs, branches, fusions }));
  const pistes = new Map(plan.cases.map((p) => [p.ref, p]));

  const fusionsParNumero = new Map(fusions.map((f) => [f.numero, f]));
  const faits: Faits = { brancheDefaut: info.brancheDefaut, chemins: new Set(parChemin.keys()), contenus, fusions: fusionsParNumero, branches: new Set(branches) };

  const familles = entree.arbre.familles;
  let faites = 0;
  const traiter = async (famille: Famille) => {
    const cases = refsParFamille.get(famille)!.map((c) => {
      const p = pistes.get(c.ref);
      return {
        ...c,
        fichiers: [...new Set(p?.fichiers ?? [])].filter((x) => parChemin.has(x)).slice(0, FICHIERS_PAR_CASE),
        fusions: [...new Set(p?.fusions ?? [])].filter((x) => fusionsParNumero.has(x)),
        branches: [...new Set(p?.branches ?? [])].filter((x) => faits.branches.has(x)),
      };
    });
    const aLire = [...new Set(cases.flatMap((c) => c.fichiers))].slice(0, FICHIERS_PAR_FAMILLE);
    const numeros = [...new Set(cases.flatMap((c) => c.fusions))];
    let verdicts = new Map<string, Verdict>();
    // Si rien dans le dépôt ne touche à cette famille, inutile de payer un appel : rien n'est prouvé.
    if (aLire.length || numeros.length || cases.some((c) => c.branches.length)) {
      await Promise.all(aLire.map(lire));
      const fichiers = aLire.map((chemin) => ({ chemin, texte: couper(contenus.get(chemin)!, MAX_ENVOI) }));
      const liees = numeros.map((x) => fusionsParNumero.get(x)!);
      const cle = `jugement:${hache([VERSION, info.brancheDefaut, famille.titre, cases, aLire.map((c) => parChemin.get(c)!.sha), liees, branches])}`;
      const rendu = await avecCache(cache, cle, () =>
        ia.juger({ description: entree.description, famille: famille.titre, cases, fichiers, fusions: liees, branches, brancheDefaut: info.brancheDefaut }));
      verdicts = new Map(rendu.cases.map((v) => [v.ref, v]));
    }
    for (const c of cases) appliquer(refs.get(c.ref)!, verdicts.get(c.ref), faits);
    progres(`Lecture du dépôt : ${++faites} famille${faites > 1 ? "s" : ""} sur ${familles.length}…`);
  };
  for (let i = 0; i < familles.length; i += 3) await Promise.all(familles.slice(i, i + 3).map(traiter));

  return { arbre: entree.arbre, depot: { ...info, luLe: new Date().toISOString(), fichiersIgnores: lisibles.length - retenus.length } };
}

const REPLI: Record<string, string> = {
  todo: "Rien trouvé dans le dépôt à ce sujet.",
  later: "Prévu après cette version, d'après votre description. Rien trouvé dans le dépôt.",
};

/** Applique à une case la décision prise par le code, et écrit un « Où on en est » qui ne dit jamais plus que ce qui est prouvé. */
export function appliquer(c: Case, v: Verdict | undefined, faits: Faits): void {
  const d = decider(c.base, v?.avis ?? "pas_fait", v?.preuves ?? [], faits);
  c.etat = d.etat; c.nonVerifie = d.nonVerifie; c.teste = d.teste; c.preuves = d.preuves;
  const dit = (v?.ouOnEnEst ?? "").replace(/\s+/g, " ").trim();
  if (d.nonVerifie) {
    c.ouOnEnEst = v?.avis === "incertain"
      ? "Non vérifié : l'outil n'a pas trouvé de quoi trancher dans le dépôt."
      : "Non vérifié : l'outil pense que c'est " + (v?.avis === "fait" ? "construit" : "commencé") + ", mais n'a trouvé aucune preuve qui tienne dans le dépôt.";
  } else if (d.etat === "done") {
    c.ouOnEnEst = (dit || "Construit.") + (d.teste ? "" : " Aucun test trouvé pour cette case.");
  } else if (d.etat === "wip") {
    c.ouOnEnEst = dit || "Commencé, pas terminé.";
  } else {
    c.ouOnEnEst = v?.avis === "pas_fait" && dit ? dit : REPLI[c.base] ?? c.ouOnEnEst;
  }
}
