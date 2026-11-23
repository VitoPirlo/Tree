// Appels au modèle d'IA (API Anthropic). La clé est lue dans l'environnement par le SDK.
// Rien de ce que l'utilisateur écrit n'est journalisé ici.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { z as zod } from "zod";
import { ArbreIA, QuestionsIA, type Question } from "./arbre.ts";
import { ARBRE_DEMO, QUESTIONS_DEMO, planDemo, jugementDemo } from "./demo.ts";
import type { ContexteJugement, ContextePlan, IALecture } from "./lecture.ts";

/** Où regarder pour chaque case. */
const PlanIA = zod.object({
  cases: zod.array(zod.object({ ref: zod.string(), fichiers: zod.array(zod.string()), fusions: zod.array(zod.number()), branches: zod.array(zod.string()) })),
});
/** L'avis de l'IA sur chaque case, avec les preuves qu'elle avance. Le code les contrôle ensuite une à une. */
const JugementIA = zod.object({
  cases: zod.array(zod.object({
    ref: zod.string(),
    avis: zod.enum(["fait", "en_cours", "pas_fait", "incertain"]),
    ouOnEnEst: zod.string(),
    preuves: zod.array(zod.object({ type: zod.enum(["fichier", "test", "fusion", "branche"]), chemin: zod.string(), extrait: zod.string(), numero: zod.number() })),
  })),
});

const MODELE = "claude-opus-5-5";

export class ErreurIA extends Error {}

export interface IA extends IALecture {
  modeDemo: boolean;
  poserQuestions(description: string): Promise<QuestionsIA>;
  genererArbre(description: string, reponses: { question: Question; reponse: string }[]): Promise<ArbreIA>;
}

const REGLES_COMMUNES = `Tu aides un fondateur ou un dirigeant qui ne lit pas le code à comprendre et piloter le logiciel qu'il fait construire. Il te donne la description de son projet, en texte libre. Tu écris en français, sans aucun jargon technique.`;

const SYSTEME_QUESTIONS = `${REGLES_COMMUNES}

À partir de sa description, tu vas plus tard dessiner un arbre du produit : produit, familles, thèmes, cases. Avant cela, pose-lui les questions dont la réponse changerait cet arbre, et seulement celles-là. Entre 3 et 5 questions, moins si la description répond déjà à tout.

Les sujets qui changent l'arbre : le périmètre de cette version, les priorités, ce qui est explicitement hors périmètre, et qui porte quelle partie du produit (un associé, un prestataire, des agents IA). Si la description ne dit pas qui fait quoi, demande-le : l'arbre affiche un responsable par famille.

Chaque question est courte, porte sur un seul sujet, et on peut y répondre en une ou deux phrases. Ne demande rien que la description dit déjà, et rien de technique. Pour chaque question, « pourquoi » dit en une phrase courte ce que la réponse change dans l'arbre.`;

const SYSTEME_ARBRE = `${REGLES_COMMUNES}

Dessine l'arbre de son produit à partir de sa description et de ses réponses. L'arbre a trois niveaux sous le produit : des familles (les grandes parties du produit, en général 4 à 8), dans chaque famille des thèmes (1 à 6), dans chaque thème des cases (1 à 10). Une case est une chose précise que le produit fait pour quelqu'un, assez petite pour être un jour « faite » ou « pas faite ».

Le lecteur ne lit pas le code. Chaque titre dit ce que le produit fait pour son utilisateur, avec les mots de cet utilisateur : « Savoir ce qui est normal », pas « Indicateurs et valeur de référence » ; « Lire les échanges Slack », pas « Connecteur Slack ». Un titre de case fait moins de 45 caractères et commence de préférence par un verbe. Même les parties invisibles du produit (fiabilité, sécurité, outils internes) se décrivent par ce qu'elles garantissent : « Chaque client ne voit que ses données ».

Couvre tout ce que la description demande : chaque engagement de la description doit se retrouver dans une case, parce que l'arbre servira ensuite à comparer la description à ce qui est réellement construit. N'invente pas de fonctions que la description ne demande pas.

Pour chaque case :
- aQuoiCaSert : une ou deux phrases courtes sur ce que cela apporte, concrètement, à la personne qui s'en sert.
- horizon : « version » si la case fait partie de la version décrite ; « apres » si la description ou les réponses la repoussent à plus tard ou la mettent hors périmètre ; « hors_depot » si ce n'est pas du logiciel (prospection, démarche, recrutement).
- citation : la phrase ou le bout de phrase de la description dont la case découle, recopié mot pour mot, sans guillemets. Laisse vide si la case vient d'une réponse ou si aucune phrase ne convient. Ne reformule jamais : une citation qui ne figure pas telle quelle dans la description sera écartée.

Pour chaque famille : une description d'une ou deux phrases sur son enjeu, l'emblème le plus parlant dans la liste proposée, et « responsable », le prénom ou le nom de la personne ou de l'équipe qui la porte si la description ou les réponses le disent. Sinon laisse « responsable » vide : ne devine pas.

Pour le produit : son nom tel que l'utilisateur l'appelle, et un résumé de deux phrases au plus, sur ce qu'il fait et pour qui.`;

const SYSTEME_PLAN = `${REGLES_COMMUNES}

L'arbre de son produit est déjà dessiné. Il faut maintenant savoir, case par case, ce qui est réellement construit dans son dépôt GitHub. Tu ne lis pas encore le code : tu reçois la liste des fichiers, la documentation, les branches et les demandes de fusion, et tu dis pour chaque case où il faudra regarder.

Pour chaque case, rends :
- fichiers : jusqu'à 4 chemins, recopiés exactement depuis la liste, les plus susceptibles de prouver que la case est construite. Mets d'abord le fichier qui fait le travail, puis son fichier de test s'il existe.
- fusions : les numéros des demandes de fusion qui portent sur cette case, fusionnées ou ouvertes.
- branches : les branches, hors branche principale, où cette case semble en chantier.

Si rien dans le dépôt ne semble toucher à une case, laisse ses trois listes vides : c'est une information utile, pas un échec. Rends une entrée par case, avec sa référence.`;

const SYSTEME_JUGEMENT = `${REGLES_COMMUNES}

Tu reçois les cases d'une famille de l'arbre de son produit, et pour chacune les fichiers, demandes de fusion et branches de son dépôt GitHub qui pourraient la concerner. Dis où en est chaque case, preuves à l'appui. Il prendra des décisions sur la foi de cette carte : une case annoncée faite à tort lui coûte plus cher qu'une case laissée « à vérifier ».

Pour chaque case, ton avis :
- « fait » : le code qui rend ce service existe sur la branche principale et il est complet pour ce que décrit la case.
- « en_cours » : c'est commencé mais pas terminé. Une branche ou une demande de fusion ouverte y travaille, ou bien le code est sur la branche principale mais incomplet, désactivé, ou réservé à un essai.
- « pas_fait » : rien dans ce que tu as lu ne rend ce service.
- « incertain » : tu ne peux pas trancher avec ce que tu as lu.

Tes preuves seront contrôlées une à une par un programme, et celles qui ne tiennent pas seront écartées, ce qui peut faire retomber la case à « non vérifié ». Pour qu'une preuve tienne :
- type « fichier » ou « test » : « chemin » est recopié exactement, et « extrait » est une ligne ou un court passage (20 à 200 caractères) recopié mot pour mot depuis le fichier fourni, à l'endroit qui montre le service rendu. Ne reformule pas, ne raccorde pas deux passages. Utilise « test » pour un fichier de test qui vérifie ce comportement.
- type « fusion » : « numero » est celui d'une demande de fusion fournie.
- type « branche » : « chemin » contient le nom exact de la branche.
Laisse vides les champs inutiles pour le type (chaîne vide, ou 0 pour le numéro). Pour une case « faite », cherche toujours un test en plus du code : « débloqué » veut dire construit et testé.

« ouOnEnEst » : une ou deux phrases courtes, sans jargon et sans nom de fichier, qui disent seulement ce que tes preuves montrent. Si quelque chose limite le service (désactivé par défaut, réservé à un essai, une partie manquante), dis-le. Pour une case « pas_fait », dis en une phrase ce qui manque.

Rends une entrée par case, avec sa référence.`;

const lignesFusions = (c: { fusions: ContextePlan["fusions"] }, corps: boolean) =>
  c.fusions.map((f) => `n° ${f.numero} · ${f.etat} · ${f.date} · ${f.auteur} · branche ${f.branche} · ${f.titre}${corps && f.corps ? `\n  ${f.corps.replace(/\s+/g, " ")}` : ""}`).join("\n") || "(aucune)";
const blocFichiers = (fs: { chemin: string; texte: string }[]) =>
  fs.map((f) => `<fichier chemin="${f.chemin}">\n${f.texte}\n</fichier>`).join("\n") || "(aucun)";

class IAAnthropic implements IA {
  modeDemo = false;
  private client = new Anthropic();

  private async appel<S extends z.ZodType>(schema: S, systeme: string, message: string, effort: "medium" | "high"): Promise<z.infer<S>> {
    try {
      // En flux, pour ne pas buter sur un délai d'attente quand l'arbre est long à écrire.
      const flux = this.client.beta.messages.stream({
        model: MODELE,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort, format: zodOutputFormat(schema) },
        // Si le modèle décline la demande, l'API la rejoue sur un modèle de repli.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: systeme,
        messages: [{ role: "user", content: message }],
      });
      const reponse = await flux.finalMessage();
      if (reponse.stop_reason === "refusal") throw new ErreurIA("L'IA a refusé de traiter cette description.");
      if (reponse.stop_reason === "max_tokens") throw new ErreurIA("La réponse de l'IA est trop longue. Essayez avec une description plus courte.");
      const texte = reponse.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return schema.parse(JSON.parse(texte));
    } catch (e) {
      if (e instanceof ErreurIA) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new ErreurIA("La clé Anthropic est refusée. Vérifiez-la dans les réglages.");
      if (e instanceof Anthropic.RateLimitError) throw new ErreurIA("Trop de demandes à l'IA en même temps. Réessayez dans une minute.");
      if (e instanceof Anthropic.APIConnectionError) throw new ErreurIA("Impossible de joindre l'IA. Vérifiez la connexion et réessayez.");
      if (e instanceof Anthropic.APIError) throw new ErreurIA(`L'IA a répondu par une erreur (code ${e.status ?? "inconnu"}). Réessayez.`);
      throw new ErreurIA("La réponse de l'IA est illisible. Réessayez.");
    }
  }

  poserQuestions(description: string) {
    return this.appel(QuestionsIA, SYSTEME_QUESTIONS, `<description>\n${description}\n</description>`, "medium");
  }

  planifier(c: ContextePlan) {
    const cases = c.cases.map((x) => `${x.ref} · ${x.titre} : ${x.aQuoiCaSert}`).join("\n");
    return this.appel(PlanIA, SYSTEME_PLAN,
      `<description>\n${c.description}\n</description>\n\n<cases>\n${cases}\n</cases>\n\n<documentation>\n${blocFichiers(c.docs)}\n</documentation>\n\n<fichiers_du_depot>\n${c.chemins.join("\n")}\n</fichiers_du_depot>\n\n<branches>\n${c.branches.join("\n")}\n</branches>\n\n<demandes_de_fusion>\n${lignesFusions(c, false)}\n</demandes_de_fusion>`, "medium");
  }

  juger(c: ContexteJugement) {
    const cases = c.cases.map((x) =>
      `${x.ref} · ${x.titre} : ${x.aQuoiCaSert}${x.citation ? `\n  Ce que dit la description : « ${x.citation} »` : ""}\n  À regarder : fichiers ${x.fichiers.join(", ") || "aucun"} ; demandes de fusion ${x.fusions.join(", ") || "aucune"} ; branches ${x.branches.join(", ") || "aucune"}`).join("\n\n");
    return this.appel(JugementIA, SYSTEME_JUGEMENT,
      `Famille : ${c.famille}. Branche principale : ${c.brancheDefaut}.\n\n<cases>\n${cases}\n</cases>\n\n<fichiers>\n${blocFichiers(c.fichiers)}\n</fichiers>\n\n<demandes_de_fusion>\n${lignesFusions(c, true)}\n</demandes_de_fusion>`, "high");
  }

  genererArbre(description: string, reponses: { question: Question; reponse: string }[]) {
    const qr = reponses
      .map((r, i) => `Question ${i + 1} : ${r.question.question}\nRéponse : ${r.reponse.trim() || "(sans réponse : ne suppose rien)"}`)
      .join("\n\n");
    return this.appel(ArbreIA, SYSTEME_ARBRE, `<description>\n${description}\n</description>\n\n<reponses>\n${qr || "(aucune question posée)"}\n</reponses>`, "high");
  }
}

/** Sans clé, l'outil reste utilisable pour voir l'interface : il rend un exemple fixe, et le dit. */
class IADemo implements IA {
  modeDemo = true;
  async poserQuestions() { return QUESTIONS_DEMO; }
  async genererArbre() { return ARBRE_DEMO; }
  async planifier(c: ContextePlan) { return planDemo(c); }
  async juger(c: ContexteJugement) { return jugementDemo(c); }
}

export function creerIA(): IA {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new IAAnthropic() : new IADemo();
}
