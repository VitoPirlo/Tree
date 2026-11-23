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
