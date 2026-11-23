// Exemple fixe, servi quand aucune clé Anthropic n'est configurée. L'interface l'annonce clairement.
import type { ArbreIA, QuestionsIA } from "./arbre.ts";

export const DESCRIPTION_DEMO = `Roule est un service pour les ateliers de réparation de vélos. Le client prend rendez-vous en ligne en moins d'une minute, sans créer de compte. Il reçoit un devis avant toute réparation et le valide depuis son téléphone. L'atelier le prévient par SMS quand le vélo est prêt. Le client paie en ligne ou sur place.

Côté atelier, le gérant voit le planning de la semaine d'un coup d'œil et sait quelles pièces commander. Chaque atelier ne voit que ses propres clients. Les données des clients sont effacées au bout de deux ans.

Hors périmètre pour cette version : l'application mobile, et la vente de vélos d'occasion. Camille construit la partie atelier, un prestataire construit la partie client. Le démarchage des ateliers se fait à la main.`;

export const QUESTIONS_DEMO: QuestionsIA = {
  questions: [
    { question: "Qui s'occupe du paiement en ligne : Camille ou le prestataire ?", pourquoi: "L'arbre affiche un responsable par famille." },
    { question: "Le devis est-il obligatoire pour toutes les réparations, même les plus petites ?", pourquoi: "Cela change les cases du parcours client." },
    { question: "Un atelier peut-il avoir plusieurs réparateurs avec chacun son planning ?", pourquoi: "Cela ajoute ou non un thème « équipe » côté atelier." },
  ],
};

const c = (titre: string, aQuoiCaSert: string, citation = "", horizon: "version" | "apres" | "hors_depot" = "version") =>
  ({ titre, aQuoiCaSert, citation, horizon });

export const ARBRE_DEMO: ArbreIA = {
  produit: { nom: "Roule", resume: "Le rendez-vous, le devis et le suivi des réparations pour les ateliers de vélos. Le client réserve en une minute, l'atelier pilote sa semaine." },
  familles: [
    {
      titre: "Parcours du client", responsable: "Prestataire", embleme: "personnes",
      description: "Tout ce que vit le client, de la prise de rendez-vous au paiement. L'enjeu : que ce soit plus simple qu'un coup de téléphone.",
      themes: [
        { titre: "Prendre rendez-vous", cases: [
          c("Réserver en moins d'une minute", "Le client choisit un créneau et repart : pas de formulaire interminable.", "Le client prend rendez-vous en ligne en moins d'une minute"),
          c("Réserver sans créer de compte", "Personne n'abandonne à cause d'un mot de passe à inventer.", "sans créer de compte"),
          c("Décrire sa panne simplement", "L'atelier sait à quoi s'attendre avant de voir le vélo."),
        ] },
        { titre: "Suivre sa réparation", cases: [
          c("Recevoir un devis avant réparation", "Le client sait ce qu'il va payer avant que l'atelier commence.", "Il reçoit un devis avant toute réparation"),
          c("Valider le devis depuis son téléphone", "Un accord en un geste, sans se déplacer ni rappeler.", "le valide depuis son téléphone"),
          c("Être prévenu quand le vélo est prêt", "Le client ne rappelle plus l'atelier pour savoir où en est son vélo.", "L'atelier le prévient par SMS quand le vélo est prêt"),
        ] },
        { titre: "Payer", cases: [
          c("Payer en ligne", "Le client règle à l'avance et récupère son vélo sans attendre.", "Le client paie en ligne ou sur place"),
          c("Payer sur place", "Ceux qui préfèrent régler à l'atelier le peuvent toujours.", "Le client paie en ligne ou sur place"),
          c("Une application sur son téléphone", "Retrouver ses réparations sans passer par le site.", "l'application mobile", "apres"),
        ] },
      ],
    },
    {
      titre: "Piloter l'atelier", responsable: "Camille", embleme: "outil",
      description: "L'outil de travail du gérant. L'enjeu : voir sa semaine et ne manquer d'aucune pièce.",
      themes: [
        { titre: "Organiser la semaine", cases: [
          c("Voir le planning d'un coup d'œil", "Le gérant sait chaque matin ce qui l'attend, sans cahier ni tableur.", "le gérant voit le planning de la semaine d'un coup d'œil"),
          c("Déplacer un rendez-vous", "Un imprévu ne désorganise pas toute la semaine."),
        ] },
        { titre: "Gérer les pièces", cases: [
          c("Savoir quelles pièces commander", "Plus de réparation bloquée faute d'une pièce oubliée.", "sait quelles pièces commander"),
          c("Vendre des vélos d'occasion", "Un revenu de plus pour l'atelier.", "la vente de vélos d'occasion", "apres"),
        ] },
      ],
    },
    {
      titre: "Confiance et données", responsable: "Camille", embleme: "cadenas",
      description: "Ce qui ne se voit pas mais qui ferait perdre un client du jour au lendemain.",
      themes: [
        { titre: "Protéger les clients", cases: [
          c("Chaque atelier ne voit que ses clients", "Un atelier ne peut jamais tomber sur les clients d'un concurrent.", "Chaque atelier ne voit que ses propres clients"),
          c("Effacer les données après deux ans", "Les informations des clients ne sont pas gardées indéfiniment.", "Les données des clients sont effacées au bout de deux ans"),
        ] },
      ],
    },
    {
      titre: "Faire connaître Roule", responsable: "", embleme: "megaphone",
      description: "Trouver les premiers ateliers.",
      themes: [
        { titre: "Lancement", cases: [
          c("Démarcher les ateliers", "Sans ateliers inscrits, aucun client ne peut réserver.", "Le démarchage des ateliers se fait à la main", "hors_depot"),
        ] },
      ],
    },
  ],
};

// ---- Dépôt d'exemple : un faux dépôt GitHub pour le mode démonstration et pour les tests. ----
import type { Depot } from "./github.ts";
import type { DemandeFusion } from "./etats.ts";
import type { ContexteJugement, ContextePlan, Pistes, Verdict } from "./lecture.ts";

const FICHIERS_DEMO: Record<string, string> = {
  "README.md": "# Roule\n\nRendez-vous et suivi de réparation pour ateliers de vélos.\n\n## Paiement\nLe paiement en ligne est en cours de branchement.\n",
  "AGENTS.md": "Toujours partir d'une branche créée depuis main. Ajouter des tests. Ne jamais fusionner sa propre demande.\n",
  "client/reservation.py": "def reserver(creneau, telephone):\n    \"\"\"Réserve un créneau sans compte : seul le téléphone est demandé.\"\"\"\n    rdv = RendezVous.objects.create(creneau=creneau, telephone=telephone)\n    return rdv\n",
  "tests/test_reservation.py": "def test_reserver_sans_compte():\n    rdv = reserver(creneau, telephone=\"0600000000\")\n    assert rdv.client is None\n",
  "client/devis.py": "def envoyer_devis(rdv, lignes):\n    devis = Devis.objects.create(rdv=rdv, total=sum(l.prix for l in lignes))\n    envoyer_sms(rdv.telephone, lien_validation(devis))\n    return devis\n",
  "tests/test_devis.py": "def test_devis_envoye_avant_reparation():\n    devis = envoyer_devis(rdv, lignes)\n    assert rdv.reparation_demarree is False\n",
  "atelier/acces.py": "def clients_visibles(atelier):\n    # chaque atelier ne voit que ses propres clients\n    return Client.objects.filter(atelier=atelier)\n",
  "tests/test_acces.py": "def test_un_atelier_ne_voit_pas_les_clients_d_un_autre():\n    assert autre_client not in clients_visibles(atelier)\n",
  "atelier/nettoyage.py": "DUREE_CONSERVATION_ANNEES = 3\n\ndef effacer_anciens_clients():\n    Client.objects.filter(dernier_rdv__lt=il_y_a(annees=DUREE_CONSERVATION_ANNEES)).delete()\n",
};
const FUSIONS_DEMO: DemandeFusion[] = [
  { numero: 3, titre: "Prise de rendez-vous sans compte", auteur: "prestataire-dev", etat: "fusionnee", date: "2026-10-02", branche: "reservation", corps: "" },
  { numero: 5, titre: "Devis envoyé par SMS avant réparation", auteur: "prestataire-dev", etat: "fusionnee", date: "2026-10-20", branche: "devis", corps: "" },
  { numero: 6, titre: "Cloisonnement des clients par atelier", auteur: "camille", etat: "fusionnee", date: "2026-11-04", branche: "acces", corps: "" },
  { numero: 9, titre: "Paiement en ligne", auteur: "prestataire-dev", etat: "ouverte", date: "2026-11-18", branche: "paiement-en-ligne", corps: "Reste à brancher le prestataire de paiement." },
];
const sha = (chemin: string) => "sha-" + chemin;

export const DEPOT_DEMO: Depot = {
  async info() { return { nom: "exemple/roule", brancheDefaut: "main", sha: "tete-demo", dateDernierCommit: "2026-11-18", ecriturePossible: false }; },
  async fichiers() { return Object.entries(FICHIERS_DEMO).map(([chemin, t]) => ({ chemin, sha: sha(chemin), taille: t.length })); },
  async branches() { return ["main", "paiement-en-ligne", "devis"]; },
  async fusions() { return FUSIONS_DEMO; },
  async contenu(s) { return FICHIERS_DEMO[s.slice(4)]; },
};

// Ce que répondrait l'IA sur ce dépôt. L'avant-dernière ligne affirme une chose sans preuve valable, exprès :
// le contrôle doit l'écarter et afficher « non vérifié ».
const SCRIPT: Record<string, { pistes: Omit<Pistes, "ref">; verdict: Omit<Verdict, "ref"> }> = {
  "Réserver sans créer de compte": {
    pistes: { fichiers: ["client/reservation.py", "tests/test_reservation.py"], fusions: [3], branches: [] },
    verdict: { avis: "fait", ouOnEnEst: "Le client réserve avec son seul numéro de téléphone.", preuves: [
      { type: "fichier", chemin: "client/reservation.py", extrait: "Réserve un créneau sans compte : seul le téléphone est demandé.", numero: 0 },
      { type: "test", chemin: "tests/test_reservation.py", extrait: "def test_reserver_sans_compte():", numero: 0 },
      { type: "fusion", chemin: "", extrait: "", numero: 3 }] },
  },
  "Recevoir un devis avant réparation": {
    pistes: { fichiers: ["client/devis.py", "tests/test_devis.py"], fusions: [5], branches: ["devis"] },
    verdict: { avis: "fait", ouOnEnEst: "Le devis part par SMS avant que la réparation commence.", preuves: [
      { type: "fichier", chemin: "client/devis.py", extrait: "envoyer_sms(rdv.telephone, lien_validation(devis))", numero: 0 },
      { type: "test", chemin: "tests/test_devis.py", extrait: "def test_devis_envoye_avant_reparation():", numero: 0 },
      { type: "fusion", chemin: "", extrait: "", numero: 5 }] },
  },
  "Chaque atelier ne voit que ses clients": {
    pistes: { fichiers: ["atelier/acces.py", "tests/test_acces.py"], fusions: [6], branches: [] },
    verdict: { avis: "fait", ouOnEnEst: "Chaque atelier n'accède qu'à ses propres clients.", preuves: [
      { type: "fichier", chemin: "atelier/acces.py", extrait: "return Client.objects.filter(atelier=atelier)", numero: 0 },
      { type: "test", chemin: "tests/test_acces.py", extrait: "def test_un_atelier_ne_voit_pas_les_clients_d_un_autre():", numero: 0 }] },
  },
  "Effacer les données après deux ans": {
    pistes: { fichiers: ["atelier/nettoyage.py"], fusions: [], branches: [] },
    verdict: { avis: "fait", ouOnEnEst: "Les anciens clients sont effacés automatiquement, au bout de trois ans.", preuves: [
      { type: "fichier", chemin: "atelier/nettoyage.py", extrait: "DUREE_CONSERVATION_ANNEES = 3", numero: 0 }] },
  },
  "Payer en ligne": {
    pistes: { fichiers: ["README.md"], fusions: [9], branches: ["paiement-en-ligne"] },
    verdict: { avis: "en_cours", ouOnEnEst: "Une demande de fusion est ouverte. Il reste à brancher le prestataire de paiement.", preuves: [
      { type: "fusion", chemin: "", extrait: "", numero: 9 }, { type: "branche", chemin: "paiement-en-ligne", extrait: "", numero: 0 }] },
  },
  "Voir le planning d'un coup d'œil": {
    pistes: { fichiers: ["README.md"], fusions: [], branches: [] },
    verdict: { avis: "fait", ouOnEnEst: "Le planning de la semaine est affiché.", preuves: [
      { type: "fichier", chemin: "atelier/planning.py", extrait: "def planning_de_la_semaine(atelier):", numero: 0 }] },
  },
  "Valider le devis depuis son téléphone": {
    pistes: { fichiers: ["client/devis.py"], fusions: [5], branches: [] },
    verdict: { avis: "incertain", ouOnEnEst: "", preuves: [] },
  },
};

export function planDemo(c: ContextePlan): { cases: Pistes[] } {
  return { cases: c.cases.map((x) => ({ ref: x.ref, ...(SCRIPT[x.titre]?.pistes ?? { fichiers: [], fusions: [], branches: [] }) })) };
}
export function jugementDemo(c: ContexteJugement): { cases: Verdict[] } {
  return { cases: c.cases.map((x) => ({ ref: x.ref, ...(SCRIPT[x.titre]?.verdict ?? { avis: "pas_fait" as const, ouOnEnEst: "", preuves: [] }) })) };
}
