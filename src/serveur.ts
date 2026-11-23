// Serveur : sert les écrans et une petite API. Les journaux ne contiennent que la méthode,
// le chemin et le code de réponse, jamais la description ni le contenu d'un dépôt.
import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normaliserArbre, normaliserQuestions } from "./arbre.ts";
import { ouvrirBase, type Base, type Projet } from "./base.ts";
import { creerIA, ErreurIA, type IA } from "./ia.ts";
import { DESCRIPTION_DEMO } from "./demo.ts";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const MAX_DESCRIPTION = 60_000;

class ErreurHttp extends Error { constructor(public code: number, message: string) { super(message); } }

async function corps(req: http.IncomingMessage): Promise<any> {
  const morceaux: Buffer[] = []; let taille = 0;
  for await (const m of req) { taille += m.length; if (taille > 300_000) throw new ErreurHttp(413, "Texte trop long."); morceaux.push(m); }
  try { return JSON.parse(Buffer.concat(morceaux).toString("utf8") || "{}"); } catch { throw new ErreurHttp(400, "Demande illisible."); }
}

/** Ce que le navigateur reçoit d'un projet. La description n'est renvoyée que pour l'afficher à son auteur. */
const vue = (p: Projet) => ({ id: p.id, nom: p.nom, etape: p.etape, questions: p.questions, arbre: p.arbre, demo: p.demo, creeLe: p.creeLe });

export function creerServeur(base: Base, ia: IA, motDePasse = process.env.APP_PASSWORD ?? "") {
  const jeton = motDePasse ? createHmac("sha256", motDePasse).update("carte-produit").digest("hex") : "";
  const connecte = (req: http.IncomingMessage) => {
    if (!motDePasse) return true;
    const recu = /(?:^|;\s*)carte=([0-9a-f]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "";
    return recu.length === jeton.length && timingSafeEqual(Buffer.from(recu), Buffer.from(jeton));
  };

  async function api(req: http.IncomingMessage, res: http.ServerResponse, chemin: string): Promise<unknown> {
    const m = req.method;
    if (chemin === "/api/etat" && m === "GET") return { connecte: connecte(req), modeDemo: ia.modeDemo, descriptionDemo: ia.modeDemo ? DESCRIPTION_DEMO : null };
    if (chemin === "/api/connexion" && m === "POST") {
      const { motDePasse: essai } = await corps(req);
      if (!motDePasse || essai !== motDePasse) throw new ErreurHttp(401, "Mot de passe incorrect.");
      const sur = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
      res.setHeader("Set-Cookie", `carte=${jeton}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${sur}`);
      return { connecte: true };
    }
    if (!connecte(req)) throw new ErreurHttp(401, "Connexion requise.");

    if (chemin === "/api/projets" && m === "GET") return base.lister().map((p) => ({ id: p.id, nom: p.nom, etape: p.etape, demo: p.demo, creeLe: p.creeLe }));
    if (chemin === "/api/projets" && m === "POST") {
      const description = String((await corps(req)).description ?? "").trim();
      if (description.length < 80) throw new ErreurHttp(400, "La description est trop courte pour en tirer un arbre. Ajoutez quelques phrases sur ce que le produit doit faire.");
      if (description.length > MAX_DESCRIPTION) throw new ErreurHttp(400, "La description est trop longue (60 000 caractères au plus).");
      const questions = normaliserQuestions(await ia.poserQuestions(description));
      return vue(base.creer(description, questions, ia.modeDemo));
    }
    const un = /^\/api\/projets\/([\w-]+)(\/reponses)?$/.exec(chemin);
    if (un) {
      const projet = base.trouver(un[1]);
      if (!projet) throw new ErreurHttp(404, "Projet introuvable.");
      if (!un[2] && m === "GET") return vue(projet);
      if (!un[2] && m === "DELETE") { base.supprimer(projet.id); return { supprime: true }; }
      if (un[2] && m === "POST") {
        const recues = (await corps(req)).reponses;
        const reponses = projet.questions.map((_, i) => String(Array.isArray(recues) ? recues[i] ?? "" : "").slice(0, 2000));
        const brut = await ia.genererArbre(projet.description, projet.questions.map((question, i) => ({ question, reponse: reponses[i] })));
        base.enregistrerArbre(projet.id, reponses, normaliserArbre(brut, projet.description));
        return vue(base.trouver(projet.id)!);
      }
    }
    throw new ErreurHttp(404, "Adresse inconnue.");
  }

  return http.createServer(async (req, res) => {
    const chemin = new URL(req.url ?? "/", "http://x").pathname;
    try {
      if (chemin.startsWith("/api/")) {
        const donnees = await api(req, res, chemin);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(donnees));
      } else {
        const fichier = path.join(PUBLIC, chemin === "/" ? "index.html" : path.normalize(chemin));
        if (!fichier.startsWith(PUBLIC)) throw new ErreurHttp(404, "Introuvable.");
        const contenu = await readFile(fichier).catch(() => { throw new ErreurHttp(404, "Introuvable."); });
        res.writeHead(200, { "Content-Type": TYPES[path.extname(fichier)] ?? "application/octet-stream", "Cache-Control": "no-cache" }).end(contenu);
      }
    } catch (e) {
      const code = e instanceof ErreurHttp ? e.code : e instanceof ErreurIA ? 502 : 500;
      const message = e instanceof ErreurHttp || e instanceof ErreurIA ? e.message : "Erreur inattendue. Réessayez.";
      if (code === 500) console.error("erreur interne :", e instanceof Error ? e.name : "inconnue");
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ erreur: message }));
    }
    console.log(`${req.method} ${chemin} ${res.statusCode}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ia = creerIA();
  const port = Number(process.env.PORT ?? 3000);
  creerServeur(ouvrirBase(), ia).listen(port, () => {
    console.log(`Carte produit : http://localhost:${port}${ia.modeDemo ? " (mode démonstration : aucune clé Anthropic)" : ""}`);
  });
}
