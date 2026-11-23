import { test } from "node:test";
import assert from "node:assert/strict";
import { decider, verifierPreuve, type DemandeFusion, type Faits, type PreuveIA } from "../src/etats.ts";

const fusion = (numero: number, etat: DemandeFusion["etat"], branche = "b" + numero): DemandeFusion =>
  ({ numero, etat, branche, titre: "Titre " + numero, auteur: "leo", date: "2026-11-18", corps: "" });

const faits = (): Faits => ({
  brancheDefaut: "main",
  chemins: new Set(["app/slack.py", "tests/test_slack.py", "app/non_lu.py"]),
  contenus: new Map([
    ["app/slack.py", "def lire_canaux(equipe):\n    return [c for c in equipe.canaux if c.public]\n"],
    ["tests/test_slack.py", "def test_les_conversations_privees_ne_sont_pas_lues():\n    assert True\n"],
  ]),
  fusions: new Map([[35, fusion(35, "fusionnee", "slack")], [40, fusion(40, "ouverte", "mails")], [41, fusion(41, "fermee", "abandon")]]),
  branches: new Set(["main", "slack", "mails", "abandon", "teams"]),
});
const fichier = (chemin: string, extrait: string, type: "fichier" | "test" = "fichier"): PreuveIA => ({ type, chemin, extrait, numero: 0 });
const pr = (numero: number): PreuveIA => ({ type: "fusion", chemin: "", extrait: "", numero });
const branche = (nom: string): PreuveIA => ({ type: "branche", chemin: nom, extrait: "", numero: 0 });
const CODE = fichier("app/slack.py", "return [c for c in equipe.canaux if c.public]");
const TEST = fichier("tests/test_slack.py", "def test_les_conversations_privees_ne_sont_pas_lues():", "test");

// ---- Contrôle des preuves ----

test("un extrait recopié mot pour mot d'un fichier lu est une preuve", () => {
  assert.deepEqual(verifierPreuve(CODE, faits()), { type: "fichier", chemin: "app/slack.py", extrait: "return [c for c in equipe.canaux if c.public]" });
});
test("les différences d'espaces et de retours à la ligne ne font pas tomber une preuve", () => {
  assert.ok(verifierPreuve(fichier("./app/slack.py", "def lire_canaux(equipe):   return [c for c in equipe.canaux if c.public]"), faits()));
});
test("un fichier qui n'existe pas n'est pas une preuve", () => {
  assert.equal(verifierPreuve(fichier("app/teams.py", "def lire_canaux(equipe):"), faits()), null);
});
test("un extrait inventé ou reformulé n'est pas une preuve", () => {
  assert.equal(verifierPreuve(fichier("app/slack.py", "return tous_les_canaux_publics(equipe)"), faits()), null);
});
test("un fichier qui existe mais sans extrait, ou avec un extrait trop court, n'est pas une preuve", () => {
  assert.equal(verifierPreuve(fichier("app/slack.py", ""), faits()), null);
  assert.equal(verifierPreuve(fichier("app/slack.py", "return"), faits()), null);
});
test("un fichier que l'outil n'a pas lu ne peut pas servir de preuve", () => {
  assert.equal(verifierPreuve(fichier("app/non_lu.py", "n'importe quel contenu ici"), faits()), null);
});
test("une preuve annoncée comme test dans un fichier qui n'en est pas un compte comme simple fichier", () => {
  assert.equal(verifierPreuve({ ...CODE, type: "test" }, faits())?.type, "fichier");
  assert.equal(verifierPreuve(TEST, faits())?.type, "test");
});
test("demandes de fusion : fusionnée et ouverte comptent, fermée et inconnue non", () => {
  assert.equal((verifierPreuve(pr(35), faits()) as any).etat, "fusionnee");
  assert.equal((verifierPreuve(pr(40), faits()) as any).etat, "ouverte");
  assert.equal(verifierPreuve(pr(41), faits()), null);
  assert.equal(verifierPreuve(pr(999), faits()), null);
});
test("branches : seule une branche encore en chantier compte", () => {
  assert.deepEqual(verifierPreuve(branche("teams"), faits()), { type: "branche", nom: "teams" });
  assert.ok(verifierPreuve(branche("mails"), faits()), "branche d'une demande ouverte");
  assert.equal(verifierPreuve(branche("main"), faits()), null, "la branche principale n'est pas un chantier");
  assert.equal(verifierPreuve(branche("slack"), faits()), null, "déjà fusionnée");
  assert.equal(verifierPreuve(branche("abandon"), faits()), null, "demande fermée");
  assert.equal(verifierPreuve(branche("fantome"), faits()), null, "n'existe pas");
});

// ---- Décision des états ----

test("débloqué : avis « fait » et preuve vérifiée sur la branche principale", () => {
  const d = decider("todo", "fait", [CODE, TEST, pr(35)], faits());
  assert.equal(d.etat, "done"); assert.equal(d.nonVerifie, false); assert.equal(d.teste, true); assert.equal(d.preuves.length, 3);
});
test("débloqué par une demande fusionnée seule, mais signalé sans test", () => {
  const d = decider("todo", "fait", [pr(35)], faits());
  assert.equal(d.etat, "done"); assert.equal(d.teste, false);
});
test("aucun état sans preuve : « fait » sans preuve qui tienne reste à débloquer, marqué non vérifié", () => {
  const d = decider("todo", "fait", [fichier("app/teams.py", "def lire_canaux(equipe):"), pr(999)], faits());
  assert.equal(d.etat, "todo"); assert.equal(d.nonVerifie, true); assert.equal(d.preuves.length, 0); assert.equal(d.ecartees, 2);
});
test("« fait » sans aucune preuve proposée : non vérifié", () => {
  assert.deepEqual(decider("todo", "fait", [], faits()), { etat: "todo", nonVerifie: true, teste: false, preuves: [], ecartees: 0 });
});
test("en cours : une demande de fusion ouverte ou une branche en chantier", () => {
  assert.equal(decider("todo", "en_cours", [pr(40)], faits()).etat, "wip");
  assert.equal(decider("todo", "en_cours", [branche("teams")], faits()).etat, "wip");
});
test("en cours : travail partiel prouvé sur la branche principale", () => {
  assert.equal(decider("todo", "en_cours", [CODE], faits()).etat, "wip");
});
test("« en cours » sans preuve reste à débloquer, non vérifié", () => {
  const d = decider("todo", "en_cours", [branche("slack"), pr(41)], faits());
  assert.equal(d.etat, "todo"); assert.equal(d.nonVerifie, true);
});
test("« fait » alors que seul un chantier est prouvé : en cours, pas débloqué", () => {
  assert.equal(decider("todo", "fait", [pr(40)], faits()).etat, "wip");
});
test("« pas fait » garde l'état tiré de la description, sans marque d'incertitude", () => {
  assert.deepEqual(decider("todo", "pas_fait", [CODE], faits()), { etat: "todo", nonVerifie: false, teste: false, preuves: [], ecartees: 0 });
  assert.equal(decider("later", "pas_fait", [], faits()).etat, "later");
});
test("« incertain » est dit sur la fiche plutôt que deviné", () => {
  const d = decider("todo", "incertain", [CODE], faits());
  assert.equal(d.etat, "todo"); assert.equal(d.nonVerifie, true);
});
test("une case repoussée par la description mais prouvée dans le dépôt est débloquée", () => {
  assert.equal(decider("later", "fait", [CODE], faits()).etat, "done");
});
test("la même preuve citée deux fois ne compte qu'une fois", () => {
  assert.equal(decider("todo", "fait", [CODE, CODE, pr(35), pr(35)], faits()).preuves.length, 2);
});
