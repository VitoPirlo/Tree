import { test } from "node:test";
import assert from "node:assert/strict";
import { citationVerifiee, normaliserArbre, normaliserQuestions, titrePropre, type ArbreIA } from "../src/arbre.ts";
import { ARBRE_DEMO, DESCRIPTION_DEMO } from "../src/demo.ts";

const DESC = "Le client prend rendez-vous en ligne.  Les données sont effacées au bout de deux ans. L’atelier voit son planning.";

const arbre = (cases: ArbreIA["familles"][0]["themes"][0]["cases"]): ArbreIA => ({
  produit: { nom: "Roule", resume: "Résumé." },
  familles: [{ titre: "Famille", description: "d", responsable: "", embleme: "outil", themes: [{ titre: "Thème", cases }] }],
});
const uneCase = (titre: string, horizon: "version" | "apres" | "hors_depot" = "version", citation = "") =>
  ({ titre, aQuoiCaSert: "utile", horizon, citation });

test("une citation présente mot pour mot est gardée, malgré espaces, casse et apostrophes", () => {
  assert.equal(citationVerifiee("les données sont effacées  au bout de deux ans", DESC), "les données sont effacées au bout de deux ans");
  assert.equal(citationVerifiee("« L'atelier voit son planning »", DESC), "L'atelier voit son planning");
});

test("une citation reformulée ou inventée est écartée", () => {
  assert.equal(citationVerifiee("Les données sont supprimées après deux ans", DESC), null);
  assert.equal(citationVerifiee("", DESC), null);
  assert.equal(citationVerifiee("ligne", DESC), null); // trop courte pour prouver quoi que ce soit
});

test("sans dépôt, aucune case n'est débloquée ni en cours", () => {
  const a = normaliserArbre(arbre([uneCase("A"), uneCase("B", "apres"), uneCase("C", "hors_depot")]), DESC);
  assert.deepEqual(a.familles[0].themes[0].cases.map((c) => c.etat), ["todo", "later", "out"]);
  assert.match(a.familles[0].themes[0].cases[0].ouOnEnEst, /Pas encore vérifié/);
});

test("les doublons, les cases sans titre et les thèmes vides disparaissent", () => {
  const brut = arbre([uneCase("Payer en ligne"), uneCase("payer  en ligne."), uneCase("  ")]);
  brut.familles[0].themes.push({ titre: "Vide", cases: [] });
  const a = normaliserArbre(brut, DESC);
  assert.equal(a.familles[0].themes.length, 1);
  assert.equal(a.familles[0].themes[0].cases.length, 1);
});

test("un arbre sans aucune case est refusé", () => {
  assert.throws(() => normaliserArbre(arbre([]), DESC));
});

test("un responsable non précisé reste vide, il n'est pas deviné", () => {
  assert.equal(normaliserArbre(arbre([uneCase("A")]), DESC).familles[0].responsable, null);
});

test("un titre trop long est coupé au mot près", () => {
  const t = titrePropre("Permettre au client de valider son devis depuis son téléphone sans rappeler l'atelier");
  assert.ok(t.length <= 61 && t.endsWith("…") && !t.includes("  "));
  assert.equal(titrePropre("Payer en ligne."), "Payer en ligne");
});

test("cinq questions au plus, sans doublon ni question vide", () => {
  const q = (question: string) => ({ question, pourquoi: "p" });
  const r = normaliserQuestions({ questions: [q("A ?"), q("a ?"), q(" "), q("B ?"), q("C ?"), q("D ?"), q("E ?"), q("F ?")] });
  assert.deepEqual(r.map((x) => x.question), ["A ?", "B ?", "C ?", "D ?", "E ?"]);
});

test("chaque case a un identifiant stable et unique", () => {
  const a = normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO);
  const ids = a.familles.flatMap((f) => f.themes.flatMap((t) => t.cases.map((c) => c.id)));
  assert.equal(new Set(ids).size, ids.length);
});

test("l'exemple de démonstration ne cite que des phrases de sa description", () => {
  const a = normaliserArbre(ARBRE_DEMO, DESCRIPTION_DEMO);
  const attendues = ARBRE_DEMO.familles.flatMap((f) => f.themes.flatMap((t) => t.cases)).filter((c) => c.citation).length;
  const gardees = a.familles.flatMap((f) => f.themes.flatMap((t) => t.cases)).filter((c) => c.citation).length;
  assert.equal(gardees, attendues);
});
