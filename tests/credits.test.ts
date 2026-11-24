import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import Stripe from "stripe";
import { ouvrirBase } from "../src/base.ts";
import { ARBRE_DEMO, DEPOT_DEMO, DESCRIPTION_DEMO, jugementDemo, planDemo, QUESTIONS_DEMO } from "../src/demo.ts";
import type { Depot } from "../src/github.ts";
import { MODELES_DEFAUT } from "../src/ia.ts";
import { ErreurTaille, lireDepot, type Cache, type IALecture } from "../src/lecture.ts";
import { appliquerPaiement, cleDeTest, evenementDepuisStripe, parametresSession } from "../src/paiement.ts";
import { FORMULES, prixCentimes } from "../src/packs.ts";
import { creerServeur } from "../src/serveur.ts";
import type { IA } from "../src/ia.ts";

const iaFausse: IA = {
  modeDemo: false,
  async poserQuestions() { return QUESTIONS_DEMO; },
  async genererArbre() { return ARBRE_DEMO; },
  async ajusterArbre() { return ARBRE_DEMO; },
  async planifier(c) { return planDemo(c); },
  async juger(c) { return jugementDemo(c); },
};

const cacheMemoire = (): Cache => { const m = new Map<string, string>(); return { lire: (c) => m.get(c) ?? null, ecrire: (c, v) => void m.set(c, v) }; };
const iaComptee = () => {
  const appels = { plan: 0, jugement: 0 };
  const ia: IALecture = {
    async planifier(c) { appels.plan++; return planDemo(c); },
    async juger(c) { appels.jugement++; return jugementDemo(c); },
  };
  return { ia, appels };
};

function serveurDe(base = ouvrirBase(":memory:"), options = {}) {
  const serveur = creerServeur(base, iaFausse, "secret", options);
  return new Promise<{ serveur: ReturnType<typeof creerServeur>; url: string }>((pret) => {
    serveur.listen(0, "127.0.0.1", () => pret({ serveur, url: `http://127.0.0.1:${(serveur.address() as AddressInfo).port}` }));
  });
}
async function appel(url: string, chemin: string, corps?: unknown, cookie = "") {
  const r = await fetch(url + chemin, {
    method: corps === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  return { code: r.status, cookie: r.headers.get("set-cookie") ?? "", d: await r.json().catch(() => ({})) as any };
}

test("les questions et le jugement n'utilisent pas le même modèle", () => {
  assert.match(MODELES_DEFAUT.questions, /haiku/);
  assert.match(MODELES_DEFAUT.reperage, /sonnet/);
  assert.match(MODELES_DEFAUT.jugement, /opus/);
  assert.notEqual(MODELES_DEFAUT.questions, MODELES_DEFAUT.jugement);
});

test("une clé Stripe réelle est refusée", () => {
  assert.equal(cleDeTest("sk_test_abc"), true);
  assert.equal(cleDeTest("sk_live_abc"), false);
  assert.equal(cleDeTest(""), false);
});

test("un nouveau commit qui ne change ni fichiers ni fusions ne relance pas l'IA", async () => {
  let sha = "commit-1";
  const depot: Depot = { ...DEPOT_DEMO, async info() { return { ...(await DEPOT_DEMO.info()), sha }; } };
  const cache = cacheMemoire(), outil = iaComptee();
  const arbre = (await import("../src/arbre.ts")).normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO);
  await lireDepot({ description: DESCRIPTION_DEMO, arbre: structuredClone(arbre) }, depot, outil.ia, cache);
  const avant = outil.appels.plan + outil.appels.jugement;
  sha = "commit-2";
  const deux = await lireDepot({ description: DESCRIPTION_DEMO, arbre: structuredClone(arbre) }, depot, outil.ia, cache);
  assert.equal(outil.appels.plan + outil.appels.jugement, avant);
  assert.equal(deux.appelsIa, 0, "tout vient du cache : aucune lecture n'est débitée");
});

test("un fichier modifié relance le repérage, pas le jugement des familles qui ne le lisent pas", async () => {
  let suffixe = "";
  const depot: Depot = {
    ...DEPOT_DEMO,
    async fichiers(s) {
      const fs = await DEPOT_DEMO.fichiers(s);
      return fs.map((f) => f.chemin === "README.md" ? { ...f, sha: f.sha + suffixe } : f);
    },
    async contenu(s) { return DEPOT_DEMO.contenu(s.endsWith("-2") ? s.slice(0, -2) : s); },
  };
  const cache = cacheMemoire(), outil = iaComptee();
  const { normaliserArbre } = await import("../src/arbre.ts");
  const arbre = () => structuredClone(normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO));
  await lireDepot({ description: DESCRIPTION_DEMO, arbre: arbre() }, depot, outil.ia, cache);
  const jugements = outil.appels.jugement;
  suffixe = "-2";
  await lireDepot({ description: DESCRIPTION_DEMO, arbre: arbre() }, depot, outil.ia, cache);
  assert.equal(outil.appels.plan, 2);
  assert.ok(outil.appels.jugement < jugements * 2, "les familles inchangées restent en cache");
});

test("un dépôt trop gros est refusé avant tout appel", async () => {
  const outil = iaComptee();
  const { normaliserArbre } = await import("../src/arbre.ts");
  await assert.rejects(
    () => lireDepot({ description: DESCRIPTION_DEMO, arbre: normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO) }, DEPOT_DEMO, outil.ia, cacheMemoire(), () => {}, { fichiersMax: 1 }),
    (e: unknown) => e instanceof ErreurTaille && e.fichiers > 1,
  );
  assert.equal(outil.appels.plan + outil.appels.jugement, 0);
});

test("les crédits se dépensent au succès, une lecture en cache est gratuite, une session ne crédite qu'une fois", async () => {
  const fichier = path.join(mkdtempSync(path.join(tmpdir(), "credits-")), "base.sqlite");
  const base = ouvrirBase(fichier);
  const vues: string[] = [];
  const { serveur, url } = await serveurDe(base, {
    creerDepot: () => DEPOT_DEMO,
    creerSession: async (p: { pack: { id: string }; centimes: number; renonciationLe: string }) => {
      vues.push(`${p.pack.id}:${p.centimes}:${p.renonciationLe ? "oui" : "non"}`);
      return { id: "cs_test_1", url: "https://checkout.stripe.com/c/test" };
    },
  });
  try {
    assert.equal((await appel(url, "/api/paiement", { pack: "essentiel", renonciation: true })).code, 401);
    const cookie = (await appel(url, "/api/connexion", { motDePasse: "secret" })).cookie.split(";")[0];
    assert.equal((await appel(url, "/api/paiement", { pack: "essentiel", renonciation: false }, cookie)).code, 400);
    const paiement = await appel(url, "/api/paiement", { pack: "essentiel", renonciation: true }, cookie);
    assert.equal(paiement.d.url, "https://checkout.stripe.com/c/test");
    assert.equal(vues[0]?.startsWith("essentiel:2900:"), true, "prix de lancement");
    assert.equal(appliquerPaiement(base, { type: "checkout.session.completed", sessionId: "cs_test_1", paiement: "pi_1", utilisateurId: "proprietaire", pack: "essentiel", paye: true }).fait, "credite");
    assert.equal(appliquerPaiement(base, { type: "checkout.session.completed", sessionId: "cs_test_1", paiement: "pi_1", utilisateurId: "proprietaire", pack: "essentiel", paye: true }).fait, "deja");
    assert.equal(base.solde("proprietaire", new Date().toISOString()).cartes, 1);

    const cree = await appel(url, "/api/projets", { description: DESCRIPTION_DEMO }, cookie);
    assert.equal(cree.code, 200);
    assert.equal(base.solde("proprietaire", new Date().toISOString()).cartes, 0);
    assert.equal((await appel(url, "/api/projets", { description: DESCRIPTION_DEMO }, cookie)).code, 402);

    const id = cree.d.id as string;
    assert.equal((await appel(url, `/api/projets/${id}/ajuster`, { reponses: [], remarque: "Il manque la caisse." }, cookie)).code, 200);
    assert.equal(base.solde("proprietaire", new Date().toISOString()).redessins, 4);

    const depot = await appel(url, `/api/projets/${id}/depot`, { depot: "exemple/roule", jeton: "" }, cookie);
    assert.equal(depot.code, 200);
    let p = depot.d;
    for (let i = 0; p.lecture?.enCours && i < 50; i++) { await new Promise((r) => setTimeout(r, 30)); p = (await appel(url, `/api/projets/${id}`, undefined, cookie)).d; }
    assert.equal(p.lecture, null);
    assert.equal(base.solde("proprietaire", new Date().toISOString()).lectures, 5);
  } finally { serveur.close(); serveur.closeAllConnections(); base.fermer(); }
});

test("le webhook vérifie la signature, crédite, puis retire en cas de remboursement", async () => {
  const base = ouvrirBase(":memory:");
  const secret = "whsec_test_secret";
  const { serveur, url } = await serveurDe(base, { secretWebhook: secret });
  const envoyer = async (event: object) => {
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const r = await fetch(url + "/api/stripe", { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": signature }, body: payload });
    return { code: r.status, d: await r.json() as any };
  };
  try {
    assert.equal((await envoyer({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } })).code, 200);
    const faux = await fetch(url + "/api/stripe", { method: "POST", headers: { "stripe-signature": "t=1,v1=non" }, body: "{}" });
    assert.equal(faux.status, 400);
    const session = { id: "cs_ok", payment_status: "paid", payment_intent: "pi_ok", metadata: { utilisateur: "proprietaire", pack: "suivi" } };
    assert.equal((await envoyer({ id: "evt_2", type: "checkout.session.completed", data: { object: session } })).d.fait, "credite");
    assert.equal((await envoyer({ id: "evt_2b", type: "checkout.session.completed", data: { object: session } })).d.fait, "deja");
    assert.equal(base.solde("proprietaire", new Date().toISOString()).cartes, FORMULES.suivi.cartes);
    assert.equal((await envoyer({ id: "evt_3", type: "charge.refunded", data: { object: { payment_intent: "pi_ok" } } })).d.fait, "retire");
    assert.equal(base.solde("proprietaire", new Date().toISOString()).cartes, 0);
  } finally { serveur.close(); serveur.closeAllConnections(); base.fermer(); }
});

test("la recharge sans formule en cours est refusée, et le journal ne garde aucun texte", async () => {
  const base = ouvrirBase(":memory:");
  base.assurerProprietaire("proprietaire@localhost");
  const { serveur, url } = await serveurDe(base, { creerSession: async () => ({ id: "cs", url: "https://checkout.stripe.com/x" }) });
  try {
    const cookie = (await appel(url, "/api/connexion", { motDePasse: "secret" })).cookie.split(";")[0];
    assert.equal((await appel(url, "/api/paiement", { pack: "recharge", renonciation: true }, cookie)).code, 400);
    base.journaliser({ utilisateurId: "proprietaire", action: "questions", input_tokens: 10, output_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 2, fichiers: 0 });
    const jour = new Date(); jour.setUTCHours(0, 0, 0, 0);
    const fin = new Date(jour); fin.setUTCDate(fin.getUTCDate() + 1);
    assert.equal(base.jetonsDuJour(jour.toISOString(), fin.toISOString()), 16);
    assert.equal(JSON.stringify(base.solde("proprietaire", new Date().toISOString())).includes("secret de projet"), false);
  } finally { serveur.close(); serveur.closeAllConnections(); base.fermer(); }
});

test("le prix de lancement s'arrête au centième acheteur", () => {
  assert.equal(prixCentimes(FORMULES.essentiel, 0), 2900);
  assert.equal(prixCentimes(FORMULES.essentiel, 99), 2900);
  assert.equal(prixCentimes(FORMULES.essentiel, 100), 4900);
  assert.equal(prixCentimes(FORMULES.suivi, 0), 9900);
});

test("les paramètres de paiement demandent un reçu et la formule", () => {
  const p = parametresSession({
    utilisateurId: "u1", email: "ada@exemple.fr", pack: FORMULES.studio, centimes: 19900,
    renonciationLe: "2026-11-24T00:00:00.000Z", succes: "https://ex.invalid/#/merci", annulation: "https://ex.invalid/#/tarifs",
  });
  assert.equal(p.mode, "payment");
  assert.equal(p.payment_intent_data?.receipt_email, "ada@exemple.fr");
  assert.equal(p.metadata?.pack, "studio");
  assert.equal(p.line_items?.[0].price_data?.unit_amount, 19900);
  assert.equal(p.line_items?.[0].price_data?.product_data?.name, "Mycelium, pack Studio (paiement unique, sans abonnement)");
});

test("un événement Stripe se lit sans garder autre chose que les identifiants", () => {
  const e = evenementDepuisStripe({
    type: "checkout.session.completed",
    data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", metadata: { utilisateur: "u", pack: "essentiel" }, customer_details: { email: "secret@exemple.fr" } } },
  });
  assert.equal(e.sessionId, "cs_1");
  assert.equal(JSON.stringify(e).includes("secret@exemple.fr"), false);
});
