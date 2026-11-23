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
