import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { normaliserArbre, type Arbre, type Case } from "../src/arbre.ts";
import { ouvrirBase } from "../src/base.ts";
import { ARBRE_DEMO, DEPOT_DEMO, DESCRIPTION_DEMO, jugementDemo, planDemo, QUESTIONS_DEMO } from "../src/demo.ts";
import type { IA } from "../src/ia.ts";
import { lireDepot, type Cache } from "../src/lecture.ts";
import { creerServeur } from "../src/serveur.ts";
import { annulerCorrection, apresLecture, avantLecture, corrigerCase, reprendre } from "../src/suivi.ts";

const cacheMemoire = (): Cache => { const m = new Map<string, string>(); return { lire: (c) => m.get(c) ?? null, ecrire: (c, v) => void m.set(c, v) }; };
const iaDemo: IA = {
  modeDemo: true,
  async poserQuestions() { return QUESTIONS_DEMO; },
  async genererArbre() { return ARBRE_DEMO; },
  async ajusterArbre() { return ARBRE_DEMO; },
  async planifier(c) { return planDemo(c); },
  async juger(c) { return jugementDemo(c); },
};
const cases = (a: Arbre) => a.familles.flatMap((f) => f.themes.flatMap((t) => t.cases));
const trouver = (a: Arbre, titre: string): Case => cases(a).find((c) => c.titre === titre)!;
/** Une lecture du dépôt d'exemple, suivie comme le fait le serveur. */
const lire = async (arbre: Arbre, lectureDavant: string | null, cache = cacheMemoire()) => {
  const avant = avantLecture(arbre);
  const r = await lireDepot({ description: DESCRIPTION_DEMO, arbre }, DEPOT_DEMO, iaDemo, cache);
  return { arbre: r.arbre, changements: apresLecture(avant, r.arbre, lectureDavant) };
};

test("corriger l'état : la case affiche l'état choisi et garde à côté celui que l'outil a lu", () => {
  const c = trouver(normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO), "Payer sur place");
  corrigerCase(c, { etat: "done" }, "2026-11-23T10:00:00Z");
  assert.equal(c.etat, "done"); assert.equal(c.etatLu, "todo"); assert.equal(c.corrige?.etat, "done");
  assert.equal(c.preuves.length, 0, "une correction ne fabrique pas de preuve");
});

test("corriger le texte : titre mis au propre, texte d'origine gardé pour pouvoir annuler", () => {
  const c = trouver(normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO), "Payer sur place");
  corrigerCase(c, { titre: "  Régler à   l'atelier. ", aQuoiCaSert: "Pour ceux qui n'aiment pas payer en ligne." });
  assert.equal(c.titre, "Régler à l'atelier"); assert.equal(c.etat, "todo"); assert.equal(c.corrige?.etat, null);
  assert.equal(c.corrige?.avant.titre, "Payer sur place");
  annulerCorrection(c);
  assert.equal(c.titre, "Payer sur place"); assert.equal(c.corrige, undefined); assert.equal(c.etatLu, undefined);
});

test("une saisie vide, un état inconnu, ou un retour à ce que disait l'outil ne laissent aucune correction", () => {
  const c = trouver(normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO), "Payer sur place");
  corrigerCase(c, { etat: "fini", titre: "   " });
  assert.equal(c.corrige, undefined); assert.equal(c.etat, "todo");
  corrigerCase(c, { etat: "wip" }); corrigerCase(c, { etat: "todo" });
  assert.equal(c.corrige, undefined); assert.equal(c.etat, "todo");
});

test("première lecture : pas de résumé, il n'y a rien à comparer", async () => {
  const { changements } = await lire(normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO), null);
  assert.equal(changements, null);
});

test("mise à jour sans changement dans le dépôt : le résumé est vide", async () => {
  const cache = cacheMemoire();
  const un = await lire(normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO), null, cache);
  const deux = await lire(un.arbre, "2026-11-20T08:00:00Z", cache);
  assert.deepEqual(deux.changements, { depuis: "2026-11-20T08:00:00Z", lignes: [] });
});

test("mise à jour : le résumé dit quelles cases ont changé d'état et quels écarts sont apparus", async () => {
  // L'arbre « d'avant » est celui tiré de la description seule : tout ce que le dépôt prouve est donc un changement.
  const arbre = normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO);
  const { changements } = await lire(arbre, "2026-11-20T08:00:00Z");
  const lignes = changements!.lignes;
  assert.ok(lignes.includes("« Réserver sans créer de compte » : À débloquer → Débloqué."), lignes.join("\n"));
  assert.ok(lignes.includes("« Payer en ligne » : À débloquer → En cours."));
  assert.ok(lignes.some((l) => l.startsWith("Nouvel écart avec ta description sur")));
  assert.ok(lignes.some((l) => l.startsWith("Trouvé dans le dépôt, sans être dans ta description :")));
  assert.ok(!lignes.some((l) => l.includes("« Payer sur place »")), "une case qui n'a pas bougé n'est pas citée");
});

test("les corrections à la main survivent à une mise à jour, y compris sur une case trouvée dans le dépôt", async () => {
  const cache = cacheMemoire();
  const { arbre } = await lire(normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO), null, cache);
  const duDepot = cases(arbre).find((c) => c.origine === "depot")!;
  const titreOutil = duDepot.titre;
  corrigerCase(trouver(arbre, "Payer en ligne"), { etat: "done" });
  corrigerCase(trouver(arbre, "Payer sur place"), { titre: "Régler à l'atelier" });
  corrigerCase(trouver(arbre, "Démarcher les ateliers"), { etat: "wip" }); // hors dépôt : la lecture ne la regarde pas
  corrigerCase(duDepot, { titre: "Mon titre à moi", etat: "todo" });

  const { arbre: apres, changements } = await lire(arbre, "2026-11-20T08:00:00Z", cache);
  const payer = trouver(apres, "Payer en ligne");
  assert.equal(payer.etat, "done"); assert.equal(payer.etatLu, "wip", "l'état lu par l'outil reste visible");
  assert.ok(payer.preuves.length > 0, "les preuves du dépôt restent affichées");
  assert.equal(trouver(apres, "Régler à l'atelier").corrige?.avant.titre, "Payer sur place");
  const demarchage = trouver(apres, "Démarcher les ateliers");
  assert.equal(demarchage.etat, "wip"); assert.equal(demarchage.etatLu, "out");
  const retrouvee = trouver(apres, "Mon titre à moi");
  assert.equal(retrouvee.origine, "depot"); assert.equal(retrouvee.etat, "todo"); assert.equal(retrouvee.corrige?.avant.titre, titreOutil);
  assert.deepEqual(changements!.lignes, [], "une correction n'est pas un changement du dépôt");
  annulerCorrection(payer);
  assert.equal(payer.etat, "wip");
});

test("quand le dépôt contredit une correction, le résumé le dit et la correction reste", () => {
  const avant = normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO);
  corrigerCase(trouver(avant, "Payer sur place"), { etat: "later" });
  const copie = avantLecture(avant);
  trouver(avant, "Payer sur place").etat = "done"; // ce que ferait une lecture qui trouve la case construite
  const c = apresLecture(copie, avant, "2026-11-20T08:00:00Z")!;
  assert.deepEqual(c.lignes, ["« Payer sur place » : À débloquer → Débloqué. Ta correction (Après cette version) est conservée."]);
  assert.equal(trouver(avant, "Payer sur place").etat, "later");
});

test("ajustement : une case nouvelle part de zéro, une case repoussée change d'horizon, une case prouvée garde son état", async () => {
  const { arbre: ancien } = await lire(normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO), null);
  const brut = structuredClone(ARBRE_DEMO);
  const theme = brut.familles[0].themes[0];
  theme.cases.push({ titre: "Choisir son réparateur", aQuoiCaSert: "Le client retrouve la personne qu'il connaît.", horizon: "version", citation: "" });
  for (const f of brut.familles) for (const t of f.themes) for (const c of t.cases) if (c.titre === "Payer sur place" || c.titre === "Réserver sans créer de compte") c.horizon = "apres";
  const nouveau = reprendre(ancien, normaliserArbre(brut, DESCRIPTION_DEMO), true);
  const neuve = trouver(nouveau, "Choisir son réparateur");
  assert.equal(neuve.etat, "todo"); assert.match(neuve.ouOnEnEst, /mettez la carte à jour/);
  assert.equal(trouver(nouveau, "Payer sur place").etat, "later");
  const prouvee = trouver(nouveau, "Réserver sans créer de compte");
  assert.equal(prouvee.etat, "done", "le dépôt la prouve : elle reste débloquée"); assert.equal(prouvee.base, "later");
});

test("serveur : sans le mot de passe on ne lit rien, et le parcours mise à jour + correction tient", async () => {
  const serveur = creerServeur(ouvrirBase(":memory:"), iaDemo, "secret");
  await new Promise<void>((pret) => serveur.listen(0, "127.0.0.1", pret));
  const url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api`;
  let cookie = "";
  const appel = async (chemin: string, corps?: unknown) => {
    const r = await fetch(url + chemin, { method: corps === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    return { code: r.status, cookie: r.headers.get("set-cookie") ?? "", d: (await r.json()) as any };
  };
  try {
    assert.equal((await appel("/projets")).code, 401);
    assert.equal((await appel("/projets", { description: DESCRIPTION_DEMO })).code, 401);
    assert.equal((await appel("/connexion", { motDePasse: "faux" })).code, 401);
    cookie = (await appel("/connexion", { motDePasse: "secret" })).cookie.split(";")[0];
    assert.equal((await appel("/projets")).code, 200);

    const cree = (await appel("/projets", { description: DESCRIPTION_DEMO })).d;
    assert.equal(cree.etape, "arbre", "le premier arbre est là dès la création, sans attendre les réponses");
    assert.ok(cree.questions.length > 0 && cree.arbre.familles.length > 0);
    const id = cree.id;
    assert.equal((await appel(`/projets/${id}/ajuster`, { reponses: [], remarque: "  " })).code, 400);
    const attendre = async () => { for (;;) { const p = (await appel(`/projets/${id}`)).d; if (!p.lecture?.enCours) return p; await new Promise((r) => setTimeout(r, 10)); } };
    await appel(`/projets/${id}/depot`, {});
    let p = await attendre();
    assert.equal(p.depot.changements, null, "première lecture : pas de résumé");
    const laCase = cases(p.arbre).find((c) => c.titre === "Payer en ligne")!;
    assert.equal((await appel(`/projets/${id}/cases/inconnue`, { etat: "done" })).code, 404);
    p = (await appel(`/projets/${id}/cases/${laCase.id}`, { etat: "done" })).d;
    assert.equal(trouver(p.arbre, "Payer en ligne").etat, "done");

    await appel(`/projets/${id}/lecture`, {});
    p = await attendre();
    assert.deepEqual(p.depot.changements.lignes, []);
    assert.equal(trouver(p.arbre, "Payer en ligne").etat, "done", "la correction a survécu à la mise à jour");
    // Ajuster l'arbre ne fait rien perdre : états, preuves, correction et cases trouvées dans le dépôt sont repris.
    const duDepot = cases(p.arbre).filter((c: Case) => c.origine === "depot").length;
    p = (await appel(`/projets/${id}/ajuster`, { reponses: ["Camille"], remarque: "Il manque la caisse." })).d;
    assert.equal(p.reponses[0], "Camille"); assert.deepEqual(p.remarques, ["Il manque la caisse."]);
    const reprise = trouver(p.arbre, "Payer en ligne");
    assert.equal(reprise.id, laCase.id); assert.equal(reprise.etat, "done"); assert.equal(reprise.etatLu, "wip"); assert.ok(reprise.preuves.length > 0);
    assert.equal(trouver(p.arbre, "Réserver sans créer de compte").etat, "done");
    assert.equal(cases(p.arbre).filter((c: Case) => c.origine === "depot").length, duDepot);
    p = (await appel(`/projets/${id}/cases/${laCase.id}`, { annuler: true })).d;
    assert.equal(trouver(p.arbre, "Payer en ligne").etat, "wip");
  } finally { serveur.close(); serveur.closeAllConnections(); }
});

test("serveur : après dix mots de passe faux, il faut attendre, même avec le bon", async () => {
  const serveur = creerServeur(ouvrirBase(":memory:"), iaDemo, "secret");
  await new Promise<void>((pret) => serveur.listen(0, "127.0.0.1", pret));
  const essai = async (motDePasse: string) => (await fetch(`http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/connexion`, { method: "POST", body: JSON.stringify({ motDePasse }) })).status;
  try {
    for (let i = 0; i < 10; i++) assert.equal(await essai("faux"), 401);
    assert.equal(await essai("faux"), 429);
    assert.equal(await essai("secret"), 429);
  } finally { serveur.close(); serveur.closeAllConnections(); }
});
