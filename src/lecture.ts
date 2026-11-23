// Lecture du dépôt et remplissage de l'arbre.
// Pour maîtriser le coût, on n'envoie jamais tout le dépôt à l'IA :
//   1. la structure, la documentation, les branches et les demandes de fusion, pour repérer où regarder ;
//   2. puis, famille par famille, seulement les fichiers repérés.
// Ce qui n'a pas changé depuis la dernière lecture est repris du cache.
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { FICHE_VIDE, titrePropre, type Arbre, type Case, type Famille } from "./arbre.ts";
import { assemblerPrompt, decider, verifierEcart, type Avis, type DemandeFusion, type EcartIA, type Faits, type PreuveIA, type PromptIA } from "./etats.ts";
import type { Depot, Fichier, InfoDepot } from "./github.ts";

export interface CaseRef { ref: string; titre: string; aQuoiCaSert: string; citation: string }
export interface Texte { chemin: string; texte: string }
export interface Pistes { ref: string; fichiers: string[]; fusions: number[]; branches: string[] }
export interface Verdict {
  ref: string; avis: Avis; ouOnEnEst: string; preuves: PreuveIA[];
  commentCaMarche: string; nature: "code" | "hors_code"; decision: string;
  taches: { qui: string; quoi: string }[]; ecart: EcartIA; prompt: PromptIA;
}
/** Une chose que le dépôt fait et dont la description ne parle pas. */
export interface Ajout extends Omit<Pistes, "ref"> { famille: string; theme: string; titre: string; aQuoiCaSert: string }
export interface Plan { depot: { presentation: string; regles: string }; cases: Pistes[]; ajouts: Ajout[] }

export interface ContextePlan { description: string; familles: { titre: string; themes: string[] }[]; cases: CaseRef[]; chemins: string[]; docs: Texte[]; branches: string[]; fusions: DemandeFusion[];
  /** Ce qu'une lecture précédente avait trouvé dans le dépôt sans que la description le demande : à renommer le moins possible. */
  dejaTrouves: { famille: string; theme: string; titre: string }[] }
export interface ContexteJugement {
  /** Ce qui est identique pour toutes les familles : mis en cache côté IA, payé une seule fois. */
  commun: { description: string; docs: Texte[]; chemins: string[] };
  famille: string; responsable: string; cases: (CaseRef & Pistes & { origine: Case["origine"] })[];
  fichiers: Texte[]; fusions: DemandeFusion[]; branches: string[]; brancheDefaut: string;
}

/** La partie de l'IA dont la lecture a besoin. */
export interface IALecture {
  planifier(c: ContextePlan): Promise<Plan>;
  juger(c: ContexteJugement): Promise<{ cases: Verdict[] }>;
}
export interface Cache { lire(cle: string): string | null; ecrire(cle: string, valeur: string): void }

// Change quand les consignes données à l'IA changent, pour ne pas resservir d'anciennes réponses.
const VERSION = "lecture-4";
const MAX_AJOUTS = 8;
const cleTitre = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const MAX_CHEMINS = 2500, MAX_TAILLE = 200_000, MAX_ENVOI = 30_000, MAX_DOC = 6000;
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

/** Ce qui a changé entre deux lectures du dépôt, en phrases prêtes à afficher. */
export interface Changements { depuis: string; lignes: string[] }
export interface ResultatLecture { arbre: Arbre; depot: InfoDepot & { luLe: string; fichiersIgnores: number; changements?: Changements | null } }

export async function lireDepot(
  entree: { description: string; precisions?: string; arbre: Arbre }, depot: Depot, ia: IALecture, cache: Cache, progres: (message: string) => void = () => {},
): Promise<ResultatLecture> {
  // L'IA lit la description et les réponses aux questions ; les citations, elles, ne se vérifient que dans la description.
  const pourIA = entree.description + (entree.precisions ? `\n\nPrécisions données ensuite par l'utilisateur :\n${entree.precisions}` : "");
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

  // Les cases trouvées dans le dépôt lors d'une lecture précédente sont reconstruites à chaque lecture.
  const dejaTrouves: ContextePlan["dejaTrouves"] = [];
  for (const f of entree.arbre.familles) {
    // On retient leur titre d'origine : si la chose existe toujours, elle doit garder le même nom d'une lecture à l'autre.
    for (const t of f.themes) for (const c of t.cases) if (c.origine === "depot") dejaTrouves.push({ famille: f.titre, theme: t.titre, titre: c.corrige?.avant.titre ?? c.titre });
    for (const t of f.themes) t.cases = t.cases.filter((c) => c.origine !== "depot");
    f.themes = f.themes.filter((t) => t.cases.length);
  }

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
  const formeArbre = entree.arbre.familles.map((f) => ({ titre: f.titre, themes: f.themes.map((t) => t.titre) }));

  progres("Repérage des endroits à lire pour chaque case…");
  const empreinteDepot = hache([info.sha, branches, fusions.map((f) => [f.numero, f.etat, f.titre])]);
  const plan = await avecCache(cache, `plan:${hache([VERSION, empreinteDepot, pourIA, toutesRefs, dejaTrouves])}`, () =>
    ia.planifier({ description: pourIA, familles: formeArbre, cases: toutesRefs, chemins: retenus.map((f) => f.chemin), docs, branches, fusions, dejaTrouves }));
  const pistes = new Map(plan.cases.map((p) => [p.ref, p]));

  // Ce que le dépôt fait et que la description ne dit pas : on l'ajoute à l'arbre, et il sera jugé comme le reste.
  let a = 0;
  for (const ajout of plan.ajouts.slice(0, MAX_AJOUTS)) {
    const famille = entree.arbre.familles.find((f) => cleTitre(f.titre) === cleTitre(ajout.famille));
    const titre = titrePropre(ajout.titre);
    if (!famille || !titre || famille.themes.some((t) => t.cases.some((c) => cleTitre(c.titre) === cleTitre(titre)))) continue;
    let theme = famille.themes.find((t) => cleTitre(t.titre) === cleTitre(ajout.theme));
    if (!theme) { theme = { id: randomUUID().slice(0, 8), titre: titrePropre(ajout.theme, 40) || "Autres", cases: [] }; famille.themes.push(theme); }
    const c: Case = {
      id: randomUUID().slice(0, 8), titre, aQuoiCaSert: ajout.aQuoiCaSert.replace(/\s+/g, " ").trim(), ouOnEnEst: "", etat: "todo", citation: null,
      base: "todo", nonVerifie: false, teste: false, preuves: [], ...FICHE_VIDE, origine: "depot",
    };
    theme.cases.push(c);
    const ref = `a${++a}`;
    refs.set(ref, c);
    refsParFamille.get(famille)!.push({ ref, titre: c.titre, aQuoiCaSert: c.aQuoiCaSert, citation: "" });
    pistes.set(ref, { ref, fichiers: ajout.fichiers, fusions: ajout.fusions, branches: ajout.branches });
  }
  const pourPrompt = {
    nom: info.nom, presentation: plan.depot.presentation, regles: plan.depot.regles,
    docs: cheminsDocs.filter((c) => !c.includes("/")),
  };
  const commun = { description: pourIA, docs, chemins: retenus.map((f) => f.chemin) };

  const fusionsParNumero = new Map(fusions.map((f) => [f.numero, f]));
  const faits: Faits = { brancheDefaut: info.brancheDefaut, chemins: new Set(parChemin.keys()), contenus, fusions: fusionsParNumero, branches: new Set(branches) };

  const familles = entree.arbre.familles;
  let faites = 0;
  const traiter = async (famille: Famille) => {
    const cases = refsParFamille.get(famille)!.map((c) => {
      const p = pistes.get(c.ref);
      return {
        ...c, origine: refs.get(c.ref)!.origine,
        fichiers: [...new Set(p?.fichiers ?? [])].filter((x) => parChemin.has(x)).slice(0, FICHIERS_PAR_CASE),
        fusions: [...new Set(p?.fusions ?? [])].filter((x) => fusionsParNumero.has(x)),
        branches: [...new Set(p?.branches ?? [])].filter((x) => faits.branches.has(x)),
      };
    });
    const aLire = [...new Set(cases.flatMap((c) => c.fichiers))].slice(0, FICHIERS_PAR_FAMILLE);
    const numeros = [...new Set(cases.flatMap((c) => c.fusions))];
    let verdicts = new Map<string, Verdict>();
    // Une famille sans aucune case à chercher dans le dépôt ne coûte aucun appel.
    if (cases.length) {
      await Promise.all(aLire.map(lire));
      const fichiers = aLire.map((chemin) => ({ chemin, texte: couper(contenus.get(chemin)!, MAX_ENVOI) }));
      const liees = numeros.map((x) => fusionsParNumero.get(x)!);
      const cle = `jugement:${hache([VERSION, empreinteDepot, pourIA, famille.titre, famille.responsable, cases, aLire.map((c) => parChemin.get(c)!.sha)])}`;
      const rendu = await avecCache(cache, cle, () =>
        ia.juger({ commun, famille: famille.titre, responsable: famille.responsable ?? "", cases, fichiers, fusions: liees, branches, brancheDefaut: info.brancheDefaut }));
      verdicts = new Map(rendu.cases.map((v) => [v.ref, v]));
    }
    for (const c of cases) appliquer(refs.get(c.ref)!, verdicts.get(c.ref), faits, { description: entree.description, depot: pourPrompt });
    progres(`Lecture du dépôt : ${++faites} famille${faites > 1 ? "s" : ""} sur ${familles.length}…`);
  };
  // La première famille passe seule : elle met le contexte commun en cache côté IA, les suivantes le relisent à prix réduit.
  if (familles.length) await traiter(familles[0]);
  for (let i = 1; i < familles.length; i += 3) await Promise.all(familles.slice(i, i + 3).map(traiter));

  // Une chose « trouvée dans le dépôt » qui ne se prouve pas n'a rien à faire sur la carte.
  for (const f of familles) {
    for (const t of f.themes) t.cases = t.cases.filter((c) => c.origine !== "depot" || c.etat === "done" || c.etat === "wip");
    f.themes = f.themes.filter((t) => t.cases.length);
  }

  return { arbre: entree.arbre, depot: { ...info, luLe: new Date().toISOString(), fichiersIgnores: lisibles.length - retenus.length } };
}

const REPLI: Record<string, string> = {
  todo: "Rien trouvé dans le dépôt à ce sujet.",
  later: "Prévu après cette version, d'après votre description. Rien trouvé dans le dépôt.",
};

/** Applique à une case la décision prise par le code, et écrit un « Où on en est » qui ne dit jamais plus que ce qui est prouvé. */
export function appliquer(
  c: Case, v: Verdict | undefined, faits: Faits,
  ctx: { description: string; depot: { nom: string; presentation: string; regles: string; docs: string[] } },
): void {
  const d = decider(c.base, v?.avis ?? "pas_fait", v?.preuves ?? [], faits);
  c.etat = d.etat; c.nonVerifie = d.nonVerifie; c.teste = d.teste; c.preuves = d.preuves;
  const net = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const construit = d.etat === "done" || d.etat === "wip";
  // Le texte « comment ça marche » décrit du code : on ne l'affiche que si la case est prouvée.
  c.commentCaMarche = construit ? net(v?.commentCaMarche) : "";
  c.taches = d.etat === "done" || d.nonVerifie ? [] : (v?.taches ?? []).map((t) => ({ qui: net(t.qui) || "À préciser", quoi: net(t.quoi) })).filter((t) => t.quoi);
  c.horsCode = d.etat === "todo" && !d.nonVerifie && v?.nature === "hors_code";
  c.decision = d.etat === "todo" && !d.nonVerifie ? net(v?.decision) : "";
  c.ecart = v ? verifierEcart(v.ecart, ctx.description, faits, d.preuves) : null;
  if (!c.ecart && c.origine === "depot" && construit) c.ecart = { citation: null, constat: "Construit dans le dépôt, alors que votre description n'en parle pas." };
  // Un prompt seulement pour du code à écrire, sur une case dont on est sûr qu'elle n'est pas faite.
  c.prompt = d.etat === "todo" && !d.nonVerifie && v?.avis === "pas_fait" && !c.horsCode ? assemblerPrompt(v.prompt, ctx.depot) : null;
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
