import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { ouvrirBase } from "../src/base.ts";
import { ARBRE_DEMO, DEPOT_DEMO, DESCRIPTION_DEMO, jugementDemo, planDemo, QUESTIONS_DEMO } from "../src/demo.ts";
import type { Depot } from "../src/github.ts";
import type { IA } from "../src/ia.ts";
import { NOM_PRODUIT, PHRASE, CONFIDENTIALITE } from "../src/marque.ts";
import { creerServeur } from "../src/serveur.ts";

const iaDemo: IA = {
  modeDemo: true,
  async poserQuestions() { return QUESTIONS_DEMO; },
  async genererArbre() { return ARBRE_DEMO; },
  async ajusterArbre() { return ARBRE_DEMO; },
  async planifier(c) { return planDemo(c); },
  async juger(c) { return jugementDemo(c); },
};

function serveurDe(base = ouvrirBase(":memory:"), ia: IA = iaDemo, options = {}) {
  const serveur = creerServeur(base, ia, "secret", options);
  return new Promise<{ serveur: typeof serveur; url: string; base: typeof base }>((pret) => {
    serveur.listen(0, "127.0.0.1", () => pret({ serveur, url: `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`, base }));
  });
}

async function appel(url: string, chemin: string, corps?: unknown, cookie = "", methode?: string) {
  const r = await fetch(url + chemin, {
    method: methode ?? (corps === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  return { code: r.status, cookie: r.headers.get("set-cookie") ?? "", entetes: r.headers, d: await r.json().catch(() => ({})) as any, texte: "" };
}

test("page publique : le nom vient d'un seul endroit, avec l'aperçu du lien", async () => {
  const { serveur, url } = await serveurDe();
  try {
    const page = await fetch(url + "/");
    const html = await page.text();
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self'/);
    assert.match(html, new RegExp(`<title>${NOM_PRODUIT}</title>`));
    assert.ok(html.includes(PHRASE));
    assert.ok(html.includes("On lit. On n'écrit pas."));
    assert.ok(html.includes("Je me lance"));
    assert.equal(html.toLowerCase().includes("jeton"), false);
    const etatPublic = await (await fetch(url + "/api/etat")).json() as { confidentialite: string };
    assert.equal(etatPublic.confidentialite, CONFIDENTIALITE);
    assert.match(html, /twitter:card" content="summary_large_image"/);
    assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/og\.png"/);
    assert.equal(html.includes("Carte produit"), false);
    const png = Buffer.from(await (await fetch(url + "/og.png")).arrayBuffer());
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    const ico = await (await fetch(url + "/favicon.svg")).text();
    assert.match(ico, new RegExp(`<title>${NOM_PRODUIT}</title>`));
  } finally { serveur.close(); serveur.closeAllConnections(); }
});

test("chaque accès ne voit que ses projets, et l'ancien projet revient au propriétaire", async () => {
  const { serveur, url, base } = await serveurDe();
  try {
    const proprio = (await appel(url, "/api/connexion", { motDePasse: "secret" })).cookie.split(";")[0];
    const cree = (await appel(url, "/api/projets", { description: DESCRIPTION_DEMO }, proprio)).d;
    assert.equal(cree.description, undefined);
    assert.equal(cree.jeton, undefined);
    const inscrit = await appel(url, "/api/inscription", { email: "ada@exemple.fr", nom: "Ada", motDePasse: "un mot long" });
    assert.equal(inscrit.code, 200);
    const cookie = inscrit.cookie.split(";")[0];
    assert.deepEqual((await appel(url, "/api/projets", undefined, cookie)).d, []);
    assert.equal((await appel(url, `/api/projets/${cree.id}`, undefined, cookie)).code, 404);
    assert.equal((await appel(url, `/api/projets/${cree.id}`, {}, cookie, "DELETE")).code, 404);
    assert.equal((await appel(url, "/api/projets", undefined, proprio)).d.length, 1);
    assert.equal((await appel(url, `/api/projets/${cree.id}`, {}, proprio, "DELETE")).d.supprime, true);
    assert.equal(base.trouver(cree.id, "proprietaire"), null);
    const sorti = await appel(url, "/api/deconnexion", {}, cookie);
    assert.equal(sorti.code, 200);
    assert.equal((await appel(url, "/api/projets", undefined, cookie)).code, 401);
  } finally { serveur.close(); serveur.closeAllConnections(); }
});

test("les projets d'avant les accès séparés sont rattachés au propriétaire", () => {
  const fichier = path.join(mkdtempSync(path.join(tmpdir(), "arbre-")), "vieux.sqlite");
  const ancien = new DatabaseSync(fichier);
  ancien.exec(`CREATE TABLE projets (
    id TEXT PRIMARY KEY, nom TEXT NOT NULL, description TEXT NOT NULL, etape TEXT NOT NULL,
    questions TEXT NOT NULL, reponses TEXT NOT NULL, arbre TEXT, demo INTEGER NOT NULL, cree_le TEXT NOT NULL)`);
  ancien.prepare("INSERT INTO projets VALUES (?,?,?,?,?,?,?,?,?)").run("ancien", "Déjà là", DESCRIPTION_DEMO, "arbre", "[]", "[]", null, 0, "2026-11-01T00:00:00.000Z");
  ancien.close();
  const base = ouvrirBase(fichier);
  base.assurerProprietaire("proprietaire@localhost");
  base.rattacherOrphelins("proprietaire");
  assert.equal(base.trouver("ancien", "proprietaire")?.nom, "Déjà là");
  assert.equal(base.trouver("ancien", "quelquun"), null);
  assert.equal(base.lister("proprietaire")[0].description, DESCRIPTION_DEMO);
  base.fermer();
});

test("un code d'invitation ne sert qu'une fois", async () => {
  const { serveur, url } = await serveurDe(ouvrirBase(":memory:"), iaDemo, { codes: ["billet-1"] });
  try {
    assert.equal((await appel(url, "/api/inscription", { email: "a@b.fr", motDePasse: "12345678" })).code, 400);
    assert.equal((await appel(url, "/api/inscription", { email: "a@b.fr", motDePasse: "12345678", code: "billet-1" })).code, 200);
    assert.equal((await appel(url, "/api/inscription", { email: "b@b.fr", motDePasse: "12345678", code: "billet-1" })).code, 400);
  } finally { serveur.close(); serveur.closeAllConnections(); }
});

test("le plafond d'essai est annoncé, rendu en cas d'échec, et un second dessin en parallèle est refusé", async () => {
  let dessins = 0;
  let panne = true;
  const ia: IA = {
    ...iaDemo,
    modeDemo: false,
    async poserQuestions() { return QUESTIONS_DEMO; },
    async genererArbre() {
      dessins++;
      await new Promise((r) => setTimeout(r, 80));
      if (panne) { panne = false; throw new Error("panne"); }
      return ARBRE_DEMO;
    },
  };
  const { serveur, url } = await serveurDe(ouvrirBase(":memory:"), ia, { plafond: 1 });
  try {
    const cookie = (await appel(url, "/api/connexion", { motDePasse: "secret" })).cookie.split(";")[0];
    const etat = (await appel(url, "/api/etat", undefined, cookie)).d;
    assert.match(etat.texteEssai, /12|1/);
    assert.match(etat.texteEssai, /Il te reste 1 action/);
    assert.equal((await appel(url, "/api/projets", { description: DESCRIPTION_DEMO }, cookie)).code, 500);
    const lente = appel(url, "/api/projets", { description: DESCRIPTION_DEMO }, cookie);
    await new Promise((r) => setTimeout(r, 30));
    const double = await appel(url, "/api/projets", { description: DESCRIPTION_DEMO }, cookie);
    const codes = [double.code, (await lente).code].sort();
    assert.deepEqual(codes, [200, 409]);
    assert.equal(dessins, 2, "l'échec est remboursé, le doublon n'appelle pas l'IA");
    assert.equal((await appel(url, "/api/projets", { description: DESCRIPTION_DEMO }, cookie)).code, 429);
  } finally { serveur.close(); serveur.closeAllConnections(); }
});

test("un jeton GitHub qui peut écrire est refusé et n'est pas gardé", async () => {
  const ia: IA = { ...iaDemo, modeDemo: false };
  let vu = "";
  const ecriture: Depot = {
    async info() { return { nom: "octo/cat", brancheDefaut: "main", sha: "abc", dateDernierCommit: "2026-11-01", ecriturePossible: true }; },
    async fichiers() { return []; }, async branches() { return []; }, async fusions() { return []; }, async contenu() { return ""; },
  };
  const { serveur, url, base } = await serveurDe(ouvrirBase(":memory:"), ia, {
    creerDepot: (_nom: string, jeton: string) => { vu = jeton; return jeton === "ecriture" ? ecriture : DEPOT_DEMO; },
  });
  try {
    const cookie = (await appel(url, "/api/connexion", { motDePasse: "secret" })).cookie.split(";")[0];
    const id = (await appel(url, "/api/projets", { description: DESCRIPTION_DEMO }, cookie)).d.id as string;
    const refus = await appel(url, `/api/projets/${id}/depot`, { depot: "octo/cat", jeton: "ecriture" }, cookie);
    assert.equal(refus.code, 400);
    assert.match(refus.d.erreur, /n'a pas été enregistré/);
    assert.equal(base.jeton(id), null);
    assert.equal(vu, "ecriture");
    const ok = await appel(url, `/api/projets/${id}/depot`, { depot: "octo/cat", jeton: "lecture" }, cookie);
    assert.equal(ok.code, 200);
    assert.equal(base.jeton(id), "lecture");
  } finally { serveur.close(); serveur.closeAllConnections(); }
});

test("les compteurs ne gardent aucun texte de projet, et l'attente après dix essais survit au redémarrage", async () => {
  const fichier = path.join(mkdtempSync(path.join(tmpdir(), "mesures-")), "base.sqlite");
  const base = ouvrirBase(fichier);
  const { serveur, url } = await serveurDe(base);
  let invite = "";
  try {
    await appel(url, "/api/mesure", { type: "visite", description: "secret de projet à ne pas garder" });
    assert.equal((await appel(url, "/api/mesure", { type: "arbre" })).code, 400);
    const proprio = (await appel(url, "/api/connexion", { motDePasse: "secret" })).cookie.split(";")[0];
    const etat = (await appel(url, "/api/etat", undefined, proprio)).d;
    assert.equal(etat.mesures.visite, 1);
    assert.equal(JSON.stringify(etat.mesures).includes("secret de projet"), false);
    const cree = await appel(url, "/api/projets", { description: DESCRIPTION_DEMO }, proprio);
    assert.equal(base.mesures().arbre, 1);
    assert.equal(cree.d.demo, true);
    invite = (await appel(url, "/api/inscription", { email: "zoe@exemple.fr", nom: "Zoé", motDePasse: "12345678" })).cookie.split(";")[0];
    for (let i = 0; i < 10; i++) assert.equal((await appel(url, "/api/connexion", { motDePasse: "faux" })).code, 401);
  } finally { serveur.close(); serveur.closeAllConnections(); base.fermer(); }
  const base2 = ouvrirBase(fichier);
  const suite = await serveurDe(base2);
  try {
    assert.equal((await appel(suite.url, "/api/connexion", { motDePasse: "secret" })).code, 429);
    assert.equal((await appel(suite.url, "/api/etat", undefined, invite)).d.mesures, null);
  } finally { suite.serveur.close(); suite.serveur.closeAllConnections(); base2.fermer(); }
});
