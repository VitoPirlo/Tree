import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { normaliserArbre } from "../src/arbre.ts";
import { ARBRE_DEMO, DEPOT_DEMO, DESCRIPTION_DEMO, jugementDemo, planDemo } from "../src/demo.ts";
import { DepotGitHub, ErreurDepot, lireNomDepot } from "../src/github.ts";
import { lireDepot, type Cache, type IALecture } from "../src/lecture.ts";

const cacheMemoire = (): Cache & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, lire: (c) => m.get(c) ?? null, ecrire: (c, v) => void m.set(c, v) };
};
const iaComptee = () => {
  const appels = { plan: 0, jugement: 0, fichiersEnvoyes: [] as string[] };
  const ia: IALecture = {
    async planifier(c) { appels.plan++; return planDemo(c); },
    async juger(c) { appels.jugement++; appels.fichiersEnvoyes.push(...c.fichiers.map((f) => f.chemin)); return jugementDemo(c); },
  };
  return { ia, appels };
};
const lecture = async (cache = cacheMemoire(), outil = iaComptee()) => {
  const arbre = normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO);
  const r = await lireDepot({ description: DESCRIPTION_DEMO, arbre }, DEPOT_DEMO, outil.ia, cache);
  const cases = new Map(r.arbre.familles.flatMap((f) => f.themes.flatMap((t) => t.cases)).map((c) => [c.titre, c]));
  return { r, cases, cache, appels: outil.appels };
};

test("lecture complète du dépôt d'exemple : chaque état est justifié", async () => {
  const { cases, r } = await lecture();
  const etat = (t: string) => cases.get(t)!.etat;
  assert.equal(etat("Réserver sans créer de compte"), "done");
  assert.equal(cases.get("Réserver sans créer de compte")!.teste, true);
  assert.equal(etat("Chaque atelier ne voit que ses clients"), "done");
  assert.equal(etat("Payer en ligne"), "wip");
  assert.equal(etat("Payer sur place"), "todo");
  assert.equal(etat("Une application sur son téléphone"), "later");
  assert.equal(etat("Démarcher les ateliers"), "out");
  assert.equal(r.depot.nom, "exemple/roule");
});

test("l'IA affirme « fait » en citant un fichier inexistant : la case reste à débloquer, non vérifiée", async () => {
  const c = (await lecture()).cases.get("Voir le planning d'un coup d'œil")!;
  assert.equal(c.etat, "todo"); assert.equal(c.nonVerifie, true); assert.equal(c.preuves.length, 0);
  assert.match(c.ouOnEnEst, /^Non vérifié/);
});

test("une case débloquée sans test le dit", async () => {
  const c = (await lecture()).cases.get("Effacer les données après deux ans")!;
  assert.equal(c.etat, "done"); assert.equal(c.teste, false);
  assert.match(c.ouOnEnEst, /Aucun test trouvé/);
});

test("toute case débloquée ou en cours porte au moins une preuve vérifiée, les autres aucune", async () => {
  for (const c of (await lecture()).cases.values()) {
    if (c.etat === "done" || c.etat === "wip") assert.ok(c.preuves.length > 0, c.titre);
    else assert.equal(c.preuves.length, 0, c.titre);
  }
});

test("coût : seuls les fichiers repérés sont envoyés, et une famille sans piste ne coûte aucun appel", async () => {
  const { appels } = await lecture();
  assert.equal(appels.plan, 1);
  assert.equal(appels.jugement, 3, "la famille « Faire connaître » est hors dépôt : pas d'appel");
  assert.ok(!appels.fichiersEnvoyes.includes("AGENTS.md"));
});

test("cache : relire un dépôt qui n'a pas changé ne rappelle pas l'IA", async () => {
  const cache = cacheMemoire(), outil = iaComptee();
  await lecture(cache, outil);
  const { cases } = await lecture(cache, outil);
  assert.deepEqual(outil.appels.plan + outil.appels.jugement, 4);
  assert.equal(cases.get("Payer en ligne")!.etat, "wip");
});

test("nom de dépôt : formes acceptées et refusées", () => {
  assert.equal(lireNomDepot("leo/spore-v2"), "leo/spore-v2");
  assert.equal(lireNomDepot(" https://github.com/leo/spore-v2.git "), "leo/spore-v2");
  assert.throws(() => lireNomDepot("spore"), ErreurDepot);
});

test("client GitHub : uniquement des lectures, et des réponses bien interprétées", async () => {
  const vus: string[] = [];
  const faux = http.createServer((req, res) => {
    vus.push(`${req.method} ${req.url} ${req.headers.authorization}`);
    const u = req.url!;
    const rep = (x: unknown, code = 200) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(x));
    if (u === "/repos/leo/prive") return rep({}, 404);
    if (u === "/repos/leo/app") return rep({ full_name: "leo/app", default_branch: "main", permissions: { push: false } });
    if (u === "/repos/leo/app/branches/main") return rep({ commit: { sha: "abc", commit: { committer: { date: "2026-11-20T10:00:00Z" } } } });
    if (u.startsWith("/repos/leo/app/git/trees/abc")) return rep({ tree: [{ type: "blob", path: "a.py", sha: "s1", size: 3 }, { type: "tree", path: "d" }] });
    if (u.startsWith("/repos/leo/app/branches?")) return rep([{ name: "main" }, { name: "chantier" }]);
    if (u.startsWith("/repos/leo/app/pulls?")) return rep([
      { number: 2, title: "B", user: { login: "leo" }, state: "open", merged_at: null, created_at: "2026-11-19T00:00:00Z", head: { ref: "chantier" }, body: null },
      { number: 1, title: "A", user: { login: "max" }, state: "closed", merged_at: "2026-11-18T00:00:00Z", created_at: "2026-11-10T00:00:00Z", head: { ref: "a" }, body: "x" },
      { number: 0, title: "Z", user: null, state: "closed", merged_at: null, created_at: "2026-11-01T00:00:00Z", head: { ref: "z" }, body: "" },
    ]);
    if (u === "/repos/leo/app/git/blobs/s1") return rep({ encoding: "base64", content: Buffer.from("été").toString("base64") });
    rep({}, 500);
  });
  await new Promise<void>((ok) => faux.listen(0, ok));
  const api = `http://localhost:${(faux.address() as AddressInfo).port}`;
  try {
    const d = new DepotGitHub("leo/app", "jeton-secret", api);
    const info = await d.info();
    assert.deepEqual(info, { nom: "leo/app", brancheDefaut: "main", sha: "abc", dateDernierCommit: "2026-11-20", ecriturePossible: false });
    assert.deepEqual(await d.fichiers("abc"), [{ chemin: "a.py", sha: "s1", taille: 3 }]);
    assert.deepEqual(await d.branches(), ["main", "chantier"]);
    assert.deepEqual((await d.fusions()).map((f) => [f.numero, f.etat, f.date, f.auteur]), [[2, "ouverte", "2026-11-19", "leo"], [1, "fusionnee", "2026-11-18", "max"], [0, "fermee", "2026-11-01", "inconnu"]]);
    assert.equal(await d.contenu("s1"), "été");
    await assert.rejects(new DepotGitHub("leo/prive", "x", api).info(), /introuvable/);
    assert.ok(vus.every((v) => v.startsWith("GET ")), "aucune écriture");
    assert.ok(vus[0].endsWith("Bearer jeton-secret"));
  } finally { faux.close(); }
});

// ---- Étape 3 : fiches, écarts, prompts ----
import { assemblerPrompt, verifierEcart, type Faits } from "../src/etats.ts";

test("écart : la phrase de la description et le fait du dépôt sont tous deux vérifiés", async () => {
  const c = (await lecture()).cases.get("Effacer les données après deux ans")!;
  assert.deepEqual(c.ecart, { citation: "Les données des clients sont effacées au bout de deux ans", constat: "Aujourd'hui, les données sont gardées trois ans." });
});

test("écart écarté si la citation n'est pas dans la description, ou si le fait n'a aucune preuve", () => {
  const faits: Faits = { brancheDefaut: "main", chemins: new Set(["a.py"]), contenus: new Map([["a.py", "DUREE_CONSERVATION_ANNEES = 3"]]), fusions: new Map(), branches: new Set(["main"]) };
  const base = { citation: "effacées au bout de deux ans", constat: "Aujourd'hui, trois ans.", chemin: "a.py", extrait: "DUREE_CONSERVATION_ANNEES = 3", numero: 0 };
  assert.ok(verifierEcart(base, DESCRIPTION_DEMO, faits, []));
  assert.equal(verifierEcart({ ...base, citation: "supprimées après vingt-quatre mois" }, DESCRIPTION_DEMO, faits, []), null);
  assert.equal(verifierEcart({ ...base, extrait: "DUREE_CONSERVATION_ANNEES = 2" }, DESCRIPTION_DEMO, faits, []), null);
  assert.equal(verifierEcart({ ...base, constat: " " }, DESCRIPTION_DEMO, faits, []), null);
});

test("ce que le dépôt fait sans que la description le demande apparaît, signalé comme écart", async () => {
  const { cases } = await lecture();
  const c = cases.get("Cumuler des points de fidélité")!;
  assert.equal(c.origine, "depot"); assert.equal(c.etat, "done"); assert.equal(c.ecart?.citation, null);
  assert.equal(cases.has("Offrir un bon cadeau"), false, "une trouvaille sans preuve n'est pas affichée");
});

test("relire le dépôt ne duplique pas les cases trouvées dans le dépôt", async () => {
  const cache = cacheMemoire(), outil = iaComptee();
  const arbre = normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO);
  await lireDepot({ description: DESCRIPTION_DEMO, arbre }, DEPOT_DEMO, outil.ia, cache);
  const r = await lireDepot({ description: DESCRIPTION_DEMO, arbre }, DEPOT_DEMO, outil.ia, cache);
  const titres = r.arbre.familles.flatMap((f) => f.themes.flatMap((t) => t.cases.map((c) => c.titre)));
  assert.equal(titres.filter((t) => t === "Cumuler des points de fidélité").length, 1);
});

test("case à débloquer : un prompt complet, avec les règles du dépôt", async () => {
  const p = (await lecture()).cases.get("Payer sur place")!.prompt!;
  for (const morceau of ["Tu travailles dans le dépôt exemple/roule", "Commence par lire README.md, AGENTS.md", "Objectif :", "Où intervenir :", "À réutiliser, sans le reconstruire :", "C'est réussi quand :", "Règles du dépôt : Toujours partir d'une branche créée depuis main"])
    assert.ok(p.includes(morceau), morceau);
});

test("une décision à prendre est portée par la fiche, avec le prompt", async () => {
  const c = (await lecture()).cases.get("Déplacer un rendez-vous")!;
  assert.match(c.decision, /Le client peut-il/); assert.ok(c.prompt); assert.equal(c.taches[0].qui, "Camille");
});

test("case qui n'est pas du code : pas de prompt, mais qui doit faire quoi", async () => {
  const c = (await lecture()).cases.get("Être prévenu quand le vélo est prêt")!;
  assert.equal(c.horsCode, true); assert.equal(c.prompt, null); assert.equal(c.taches.length, 1);
});

test("pas de prompt ni de « comment ça marche » sur une case non vérifiée", async () => {
  const c = (await lecture()).cases.get("Voir le planning d'un coup d'œil")!;
  assert.equal(c.prompt, null); assert.equal(c.commentCaMarche, ""); assert.equal(c.ecart, null);
});

test("case en cours : ce qui existe, et qui doit faire quoi", async () => {
  const c = (await lecture()).cases.get("Payer en ligne")!;
  assert.ok(c.commentCaMarche); assert.deepEqual(c.taches.map((t) => t.qui), ["Prestataire", "Camille"]); assert.equal(c.prompt, null);
});

test("prompt : sans objectif ou sans critère de réussite, pas de prompt ; sans règles écrites, pas de rubrique inventée", () => {
  const depot = { nom: "a/b", presentation: "", regles: "", docs: [] };
  const p = { objectif: "faire X", ouIntervenir: "", aReutiliser: "", reussiQuand: "Y passe", attention: "" };
  assert.equal(assemblerPrompt({ ...p, objectif: " " }, depot), null);
  assert.equal(assemblerPrompt({ ...p, reussiQuand: "" }, depot), null);
  const texte = assemblerPrompt(p, depot)!;
  assert.ok(!texte.includes("Règles du dépôt") && !texte.includes("Commence par lire") && !texte.includes("Attention"));
});
