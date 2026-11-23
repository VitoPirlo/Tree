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
import { DEPOT_DEMO, DESCRIPTION_DEMO } from "./demo.ts";
import { DepotGitHub, ErreurDepot, lireNomDepot, type Depot } from "./github.ts";
import { lireDepot } from "./lecture.ts";
import { annulerCorrection, apresLecture, avantLecture, corrigerCase, reprendre } from "./suivi.ts";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const MAX_DESCRIPTION = 60_000;

class ErreurHttp extends Error { constructor(public code: number, message: string) { super(message); } }

async function corps(req: http.IncomingMessage): Promise<any> {
  const morceaux: Buffer[] = []; let taille = 0;
  for await (const m of req) { taille += m.length; if (taille > 300_000) throw new ErreurHttp(413, "Texte trop long."); morceaux.push(m); }
  try { return JSON.parse(Buffer.concat(morceaux).toString("utf8") || "{}"); } catch { throw new ErreurHttp(400, "Demande illisible."); }
}

interface Lecture { enCours: boolean; message: string; erreur: string | null }

export function creerServeur(base: Base, ia: IA, motDePasse = process.env.APP_PASSWORD ?? "") {
  const jeton = motDePasse ? createHmac("sha256", motDePasse).update("carte-produit").digest("hex") : "";
  const connecte = (req: http.IncomingMessage) => {
    if (!motDePasse) return true;
    const recu = /(?:^|;\s*)carte=([0-9a-f]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "";
    return recu.length === jeton.length && timingSafeEqual(Buffer.from(recu), Buffer.from(jeton));
  };

  // Un seul mot de passe protège tout : on ralentit celui qui essaie de le deviner. Dix erreurs, puis un quart d'heure d'attente.
  const echecs = new Map<string, { n: number; debut: number }>();
  const QUART_HEURE = 15 * 60_000, MAX_ECHECS = 10;
  const origine = (req: http.IncomingMessage) => String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "inconnue";
  const bloque = (qui: string) => { const e = echecs.get(qui); if (e && Date.now() - e.debut > QUART_HEURE) echecs.delete(qui); return (echecs.get(qui)?.n ?? 0) >= MAX_ECHECS; };

  // Lectures de dépôt en cours. Elles durent plusieurs minutes : le navigateur vient demander où on en est.
  const lectures = new Map<string, Lecture>();
  /** Ce que le navigateur reçoit d'un projet : ni la description, ni le jeton GitHub. */
  const vue = (p: Projet) => ({ id: p.id, nom: p.nom, etape: p.etape, questions: p.questions, reponses: p.reponses, remarques: p.remarques, arbre: p.arbre, demo: p.demo, creeLe: p.creeLe, depot: p.depot, lecture: lectures.get(p.id) ?? null });

  function lancerLecture(projet: Projet, depot: Depot) {
    if (lectures.get(projet.id)?.enCours || !projet.arbre) return;
    const suivi: Lecture = { enCours: true, message: "Connexion au dépôt…", erreur: null };
    lectures.set(projet.id, suivi);
    const precisions = [...projet.questions.map((q, i) => (projet.reponses[i]?.trim() ? `${q.question} ${projet.reponses[i].trim()}` : "")), ...projet.remarques].filter(Boolean).join("\n");
    // Une copie de l'arbre d'avant, pour remettre les corrections à la main et dire ce qui a changé.
    const avant = avantLecture(projet.arbre), lectureDavant = projet.depot?.luLe;
    lireDepot({ description: projet.description, precisions, arbre: projet.arbre }, depot, ia, base.cache, (m) => { suivi.message = m; })
      .then((r) => { r.depot.changements = apresLecture(avant, r.arbre, lectureDavant); base.enregistrerLecture(projet.id, r); lectures.delete(projet.id); })
      .catch((e) => {
        suivi.enCours = false;
        suivi.erreur = e instanceof ErreurDepot || e instanceof ErreurIA ? e.message : "La lecture du dépôt a échoué. Réessayez.";
        if (!(e instanceof ErreurDepot || e instanceof ErreurIA)) console.error("lecture interrompue :", e instanceof Error ? e.name : "inconnue");
      });
  }
  const depotDe = (projet: Projet): Depot | null => {
    if (!projet.depot) return null;
    return projet.demo ? DEPOT_DEMO : new DepotGitHub(projet.depot.nom, base.jeton(projet.id) ?? "");
  };

  async function api(req: http.IncomingMessage, res: http.ServerResponse, chemin: string): Promise<unknown> {
    const m = req.method;
    if (chemin === "/api/etat" && m === "GET") return { connecte: connecte(req), modeDemo: ia.modeDemo, descriptionDemo: ia.modeDemo ? DESCRIPTION_DEMO : null };
    if (chemin === "/api/connexion" && m === "POST") {
      const { motDePasse: essai } = await corps(req);
      const qui = origine(req);
      if (bloque(qui)) throw new ErreurHttp(429, "Trop d'essais. Réessayez dans un quart d'heure.");
      if (!motDePasse || essai !== motDePasse) {
        const e = echecs.get(qui) ?? { n: 0, debut: Date.now() };
        e.n++; echecs.set(qui, e);
        throw new ErreurHttp(401, "Mot de passe incorrect.");
      }
      echecs.delete(qui);
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
      // Le premier arbre se dessine tout de suite, à partir de la description seule. Les questions servent ensuite à l'affiner.
      const [questions, brut] = await Promise.all([ia.poserQuestions(description), ia.genererArbre(description, [])]);
      const arbre = normaliserArbre(brut, description);
      const projet = base.creer(description, normaliserQuestions(questions), ia.modeDemo);
      base.enregistrerArbre(projet.id, [], arbre);
      return vue(base.trouver(projet.id)!);
    }
    const un = /^\/api\/projets\/([\w-]+)(\/reponses|\/ajuster|\/depot|\/lecture|\/cases\/[\w-]+)?$/.exec(chemin);
    if (un) {
      const projet = base.trouver(un[1]);
      if (!projet) throw new ErreurHttp(404, "Projet introuvable.");
      if (!un[2] && m === "GET") return vue(projet);
      if (!un[2] && m === "DELETE") { base.supprimer(projet.id); return { supprime: true }; }
      if (un[2] === "/depot" && m === "POST") {
        if (projet.etape !== "arbre") throw new ErreurHttp(400, "Générez d'abord l'arbre.");
        const recu = await corps(req);
        if (projet.demo) base.connecterDepot(projet.id, "exemple/roule", "");
        else {
          const nom = lireNomDepot(String(recu.depot ?? "")), jeton = String(recu.jeton ?? "").trim();
          await new DepotGitHub(nom, jeton).info(); // vérifie tout de suite que le dépôt est lisible avec ce jeton
          base.connecterDepot(projet.id, nom, jeton);
        }
        const connecte = base.trouver(projet.id)!;
        lancerLecture(connecte, depotDe(connecte)!);
        return vue(connecte);
      }
      if (un[2] === "/lecture" && m === "POST") {
        const depot = depotDe(projet);
        if (!depot) throw new ErreurHttp(400, "Aucun dépôt n'est connecté à ce projet.");
        lancerLecture(projet, depot);
        return vue(projet);
      }
      if (un[2]?.startsWith("/cases/") && m === "POST") {
        if (lectures.get(projet.id)?.enCours) throw new ErreurHttp(409, "Une lecture du dépôt est en cours. Corrigez la case quand elle sera terminée.");
        const laCase = projet.arbre?.familles.flatMap((f) => f.themes.flatMap((t) => t.cases)).find((c) => c.id === un[2]!.slice(7));
        if (!projet.arbre || !laCase) throw new ErreurHttp(404, "Case introuvable.");
        const recu = await corps(req);
        if (recu.annuler) annulerCorrection(laCase); else corrigerCase(laCase, recu);
        base.enregistrerCorrection(projet.id, projet.arbre);
        return vue(base.trouver(projet.id)!);
      }
      if (un[2] === "/ajuster" && m === "POST") {
        if (!projet.arbre) throw new ErreurHttp(400, "Générez d'abord l'arbre.");
        if (lectures.get(projet.id)?.enCours) throw new ErreurHttp(409, "Une lecture du dépôt est en cours. Ajustez l'arbre quand elle sera terminée.");
        const recu = await corps(req);
        const remarque = String(recu.remarque ?? "").trim().slice(0, 4000);
        const saisies = projet.questions.map((_, i) => String(Array.isArray(recu.reponses) ? recu.reponses[i] ?? "" : "").trim().slice(0, 2000));
        const nouvelles = projet.questions.map((question, i) => ({ question, reponse: saisies[i] })).filter((r) => r.reponse);
        if (!nouvelles.length && !remarque) throw new ErreurHttp(400, "Répondez à une question ou dites ce qui ne va pas dans l'arbre.");
        const dejaPris = [...projet.questions.map((q, i) => (!saisies[i] && projet.reponses[i]?.trim() ? `${q.question} ${projet.reponses[i].trim()}` : "")), ...projet.remarques].filter(Boolean);
        const sansDepot = structuredClone(projet.arbre);
        for (const f of sansDepot.familles) { for (const t of f.themes) t.cases = t.cases.filter((c) => c.origine !== "depot"); f.themes = f.themes.filter((t) => t.cases.length); }
        const brut = await ia.ajusterArbre({ description: projet.description, arbre: sansDepot, nouvelles, dejaPris, remarque });
        const arbre = reprendre(projet.arbre, normaliserArbre(brut, projet.description), !!projet.depot?.sha);
        base.enregistrerAjustement(projet.id, projet.questions.map((_, i) => saisies[i] || projet.reponses[i] || ""), remarque ? [...projet.remarques, remarque] : projet.remarques, arbre);
        return vue(base.trouver(projet.id)!);
      }
      if (un[2] === "/reponses" && m === "POST") {
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
      const code = e instanceof ErreurHttp ? e.code : e instanceof ErreurIA ? 502 : e instanceof ErreurDepot ? 400 : 500;
      const message = e instanceof ErreurHttp || e instanceof ErreurIA || e instanceof ErreurDepot ? e.message : "Erreur inattendue. Réessayez.";
      if (code === 500) console.error("erreur interne :", e instanceof Error ? e.name : "inconnue");
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ erreur: message }));
    }
    console.log(`${req.method} ${chemin} ${res.statusCode}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ia = creerIA();
  const port = Number(process.env.PORT ?? 3000);
  // Sans mot de passe, l'outil ne répond qu'à cet ordinateur : il ne peut pas se retrouver en ligne ouvert à tous.
  const protege = !!process.env.APP_PASSWORD;
  creerServeur(ouvrirBase(), ia).listen(port, protege ? "0.0.0.0" : "127.0.0.1", () => {
    console.log(`Carte produit : http://localhost:${port}${ia.modeDemo ? " (mode démonstration : aucune clé Anthropic)" : ""}`);
    if (!protege) console.log("Aucun mot de passe (APP_PASSWORD) : l'outil n'est accessible que depuis cet ordinateur.");
  });
}
