// Serveur : sert les écrans et une petite API. Les journaux ne contiennent que la méthode,
// le chemin et le code de réponse, jamais la description ni le contenu d'un dépôt.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normaliserArbre, normaliserQuestions } from "./arbre.ts";
import { ouvrirBase, type Base, type Projet, type Utilisateur } from "./base.ts";
import { hacherMotDePasse, motsEgaux, verifierMotDePasse } from "./compte.ts";
import { creerIA, ErreurIA, type IA } from "./ia.ts";
import { DEPOT_DEMO, DESCRIPTION_DEMO } from "./demo.ts";
import { DepotGitHub, ErreurDepot, lireNomDepot, type Depot } from "./github.ts";
import { lireDepot } from "./lecture.ts";
import { messagePlafond, NOM_PRODUIT, PHRASE, phraseEssai, PLAFOND_IA_DEFAUT, textesAccueil } from "./marque.ts";
import { faviconSvg, imageLien } from "./og.ts";
import { annulerCorrection, apresLecture, avantLecture, corrigerCase, reprendre } from "./suivi.ts";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const MAX_DESCRIPTION = 60_000;
const QUART_HEURE = 15 * 60_000, MAX_ECHECS = 10;
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

class ErreurHttp extends Error { constructor(public code: number, message: string) { super(message); } }

async function corps(req: http.IncomingMessage): Promise<any> {
  const morceaux: Buffer[] = []; let taille = 0;
  for await (const m of req) { taille += (m as Buffer).length; if (taille > 300_000) throw new ErreurHttp(413, "Texte trop long."); morceaux.push(m as Buffer); }
  try { return JSON.parse(Buffer.concat(morceaux).toString("utf8") || "{}"); } catch { throw new ErreurHttp(400, "Demande illisible."); }
}

const echap = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

interface Lecture { enCours: boolean; message: string; erreur: string | null }
export interface OptionsServeur {
  /** Pour les essais : remplace l'accès GitHub réel. */
  creerDepot?: (nom: string, jeton: string) => Depot;
  /** Plafond d'actions IA par accès. Sinon TREE_PLAFOND_IA, sinon 12. */
  plafond?: number;
  /** Codes d'invitation à usage unique. Tableau vide : inscription ouverte. Absent : lu dans TREE_CODES_INVITATION. */
  codes?: string[];
}

function plafondDe(options: OptionsServeur): number {
  const brut = options.plafond ?? process.env.TREE_PLAFOND_IA;
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : PLAFOND_IA_DEFAUT;
}

function emailProprietaire(): string {
  const brut = (process.env.TREE_OWNER_EMAIL ?? "proprietaire@localhost").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(brut) ? brut : "proprietaire@localhost";
}

export function creerServeur(base: Base, ia: IA, motDePasse = process.env.APP_PASSWORD ?? "", options: OptionsServeur = {}) {
  const plafond = plafondDe(options);
  const creerDepot = options.creerDepot ?? ((nom: string, jeton: string) => new DepotGitHub(nom, jeton));
  const codes = options.codes ?? (process.env.TREE_CODES_INVITATION ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const codeRequis = codes.length > 0;
  base.chargerCodes(codes);
  const emailOwner = emailProprietaire();
  if (motDePasse) {
    base.assurerProprietaire(emailOwner);
    base.rattacherOrphelins("proprietaire");
    base.rattacherCompte("local", "proprietaire");
  } else {
    base.assurerLocal();
    base.rattacherOrphelins("local");
  }

  const jetonCookie = (req: http.IncomingMessage) => /(?:^|;\s*)carte=([0-9a-f]{64})/.exec(req.headers.cookie ?? "")?.[1] ?? "";
  const qui = (req: http.IncomingMessage): Utilisateur | null => {
    if (!motDePasse) return base.trouverUtilisateur("local");
    const recu = jetonCookie(req);
    return recu ? base.session(recu) : null;
  };

  // Dix erreurs, puis un quart d'heure. Le compteur est dans la base : un redémarrage ne le remet pas à zéro.
  const origine = (req: http.IncomingMessage) => String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "inconnue";
  const bloque = (req: http.IncomingMessage) => base.bloque(origine(req), Date.now(), QUART_HEURE, MAX_ECHECS);
  const noterEchec = (req: http.IncomingMessage) => base.noterEchec(origine(req), Date.now(), QUART_HEURE);

  const lectures = new Map<string, Lecture>();
  const creations = new Set<string>();
  const ajustements = new Set<string>();

  const essaiDe = (u: Utilisateur) => {
    const frais = base.trouverUtilisateur(u.id) ?? u;
    const reste = Math.max(0, plafond - frais.actions);
    return { plafond, reste, texte: phraseEssai(plafond, reste) };
  };
  /** Ce que le navigateur reçoit d'un projet : ni la description, ni le jeton GitHub. */
  const vue = (p: Projet, u: Utilisateur) => ({
    id: p.id, nom: p.nom, etape: p.etape, questions: p.questions, reponses: p.reponses, remarques: p.remarques,
    arbre: p.arbre, demo: p.demo, creeLe: p.creeLe, depot: p.depot, lecture: lectures.get(p.id) ?? null, essai: essaiDe(u),
  });

  function exiger(req: http.IncomingMessage): Utilisateur {
    const u = qui(req);
    if (!u) throw new ErreurHttp(401, "Connexion requise.");
    return u;
  }

  function lancerLecture(projet: Projet, depot: Depot, u: Utilisateur) {
    if (lectures.get(projet.id)?.enCours || !projet.arbre) return;
    if (!base.reserverAction(u.id, plafond)) {
      lectures.set(projet.id, { enCours: false, message: "", erreur: messagePlafond(plafond) });
      return;
    }
    const suivi: Lecture = { enCours: true, message: "Connexion au dépôt…", erreur: null };
    lectures.set(projet.id, suivi);
    const precisions = [...projet.questions.map((q, i) => (projet.reponses[i]?.trim() ? `${q.question} ${projet.reponses[i].trim()}` : "")), ...projet.remarques].filter(Boolean).join("\n");
    const avant = avantLecture(projet.arbre), lectureDavant = projet.depot?.luLe;
    lireDepot({ description: projet.description, precisions, arbre: projet.arbre }, depot, ia, base.cache, (m) => { suivi.message = m; })
      .then((r) => { r.depot.changements = apresLecture(avant, r.arbre, lectureDavant); base.enregistrerLecture(projet.id, r); lectures.delete(projet.id); })
      .catch((e) => {
        base.rendreAction(u.id);
        suivi.enCours = false;
        suivi.erreur = e instanceof ErreurDepot || e instanceof ErreurIA ? e.message : "La lecture du dépôt a échoué. Réessaie.";
        if (!(e instanceof ErreurDepot || e instanceof ErreurIA)) console.error("lecture interrompue :", e instanceof Error ? e.name : "inconnue");
      });
  }
  const depotDe = (projet: Projet): Depot | null => {
    if (!projet.depot) return null;
    return projet.demo ? DEPOT_DEMO : creerDepot(projet.depot.nom, base.jeton(projet.id) ?? "");
  };

  function poserSession(req: http.IncomingMessage, res: http.ServerResponse, u: Utilisateur) {
    const brut = base.ouvrirSession(u.id);
    const sur = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `carte=${brut}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${sur}`);
    base.reinitialiserEchecs(origine(req));
  }

  async function api(req: http.IncomingMessage, res: http.ServerResponse, chemin: string): Promise<unknown> {
    const m = req.method;
    if (chemin === "/api/etat" && m === "GET") {
      const u = qui(req);
      const baseEtat = {
        connecte: !!u, modeDemo: ia.modeDemo, descriptionDemo: ia.modeDemo ? DESCRIPTION_DEMO : null,
        nom: NOM_PRODUIT, phrase: PHRASE, description: textesAccueil(plafond).DESCRIPTION, confidentialite: textesAccueil(plafond).CONFIDENTIALITE,
        codeRequis, plafond,
      };
      if (!u) return { ...baseEtat, email: null, proprietaire: false, reste: null, texteEssai: phraseEssai(plafond, plafond), mesures: null };
      const essai = essaiDe(u);
      return { ...baseEtat, email: u.email, proprietaire: u.proprietaire, reste: essai.reste, texteEssai: essai.texte, mesures: u.proprietaire ? base.mesures() : null };
    }
    if (chemin === "/api/mesure" && m === "POST") {
      const recu = await corps(req);
      if (recu.type !== "visite") throw new ErreurHttp(400, "Mesure inconnue.");
      base.mesure("visite");
      return { ok: true };
    }
    if (chemin === "/api/connexion" && m === "POST") {
      if (bloque(req)) throw new ErreurHttp(429, "Trop d'essais. Réessaie dans un quart d'heure.");
      const recu = await corps(req);
      const essai = String(recu.motDePasse ?? "");
      const email = String(recu.email ?? "").trim().toLowerCase();
      let u: Utilisateur | null = null;
      if (!email) {
        if (motDePasse && motsEgaux(essai, motDePasse)) u = base.trouverUtilisateur("proprietaire");
      } else {
        const compte = base.trouverParEmail(email);
        if (compte?.id === "proprietaire" && motDePasse && motsEgaux(essai, motDePasse)) u = compte;
        else if (compte?.hash && verifierMotDePasse(essai, compte.hash)) u = compte;
      }
      if (!u) { noterEchec(req); throw new ErreurHttp(401, email ? "Adresse ou mot de passe incorrect." : "Mot de passe incorrect."); }
      poserSession(req, res, u);
      return { connecte: true };
    }
    if (chemin === "/api/inscription" && m === "POST") {
      if (bloque(req)) throw new ErreurHttp(429, "Trop d'essais. Réessaie dans un quart d'heure.");
      const recu = await corps(req);
      const email = String(recu.email ?? "").trim().toLowerCase();
      const nom = String(recu.nom ?? "").trim().slice(0, 80) || "Vous";
      const mot = String(recu.motDePasse ?? "");
      const code = String(recu.code ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new ErreurHttp(400, "Indique une adresse e-mail valide.");
      if (mot.length < 8 || mot.length > 200) throw new ErreurHttp(400, "Le mot de passe doit faire au moins 8 caractères.");
      if (email === emailOwner || base.trouverParEmail(email)) throw new ErreurHttp(400, "Un accès existe déjà avec cette adresse.");
      if (codeRequis && !base.reserverCode(code)) { noterEchec(req); throw new ErreurHttp(400, "Ce code d'invitation ne convient pas, ou il a déjà servi."); }
      try {
        const u = base.inscrire(email, nom, hacherMotDePasse(mot));
        if (codeRequis) base.confirmerCode(code, u.id);
        poserSession(req, res, u);
        return { connecte: true };
      } catch (e) {
        if (codeRequis) base.libererCode(code);
        throw e;
      }
    }
    if (chemin === "/api/deconnexion" && m === "POST") {
      const brut = jetonCookie(req);
      if (brut) base.fermerSession(brut);
      const sur = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
      res.setHeader("Set-Cookie", `carte=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${sur}`);
      return { connecte: false };
    }

    const u = exiger(req);

    if (chemin === "/api/projets" && m === "GET") return base.lister(u.id).map((p) => ({ id: p.id, nom: p.nom, etape: p.etape, demo: p.demo, creeLe: p.creeLe }));
    if (chemin === "/api/projets" && m === "POST") {
      const description = String((await corps(req)).description ?? "").trim();
      if (description.length < 80) throw new ErreurHttp(400, "La description est trop courte pour en tirer une carte. Ajoute quelques phrases sur ce que le produit doit faire.");
      if (description.length > MAX_DESCRIPTION) throw new ErreurHttp(400, "La description est trop longue (60 000 caractères au plus).");
      if (creations.has(u.id)) throw new ErreurHttp(409, "Une carte est déjà en train de se dessiner.");
      creations.add(u.id);
      let reserve = false;
      try {
        if (!base.reserverAction(u.id, plafond)) throw new ErreurHttp(429, messagePlafond(plafond));
        reserve = true;
        const [questions, brut] = await Promise.all([ia.poserQuestions(description), ia.genererArbre(description, [])]);
        const arbre = normaliserArbre(brut, description);
        const projet = base.creer(u.id, description, normaliserQuestions(questions), ia.modeDemo);
        base.enregistrerArbre(projet.id, [], arbre);
        base.mesure("arbre");
        reserve = false;
        return vue(base.trouver(projet.id, u.id)!, u);
      } catch (e) {
        if (reserve) base.rendreAction(u.id);
        throw e;
      } finally { creations.delete(u.id); }
    }
    const un = /^\/api\/projets\/([\w-]+)(\/reponses|\/ajuster|\/depot|\/lecture|\/cases\/[\w-]+)?$/.exec(chemin);
    if (un) {
      const projet = base.trouver(un[1], u.id);
      if (!projet) throw new ErreurHttp(404, "Projet introuvable.");
      if (!un[2] && m === "GET") return vue(projet, u);
      if (!un[2] && m === "DELETE") { base.supprimer(projet.id, u.id); return { supprime: true }; }
      if (un[2] === "/depot" && m === "POST") {
        if (projet.etape !== "arbre") throw new ErreurHttp(400, "Dessine d'abord la carte.");
        const recu = await corps(req);
        if (projet.demo) base.connecterDepot(projet.id, "exemple/roule", "");
        else {
          const nom = lireNomDepot(String(recu.depot ?? ""));
          const jeton = String(recu.jeton ?? "").trim();
          const distant = creerDepot(nom, jeton);
          const info = await distant.info();
          if (info.ecriturePossible) throw new ErreurDepot(`${NOM_PRODUIT} refuse un accès qui peut modifier le dépôt. Il n'a pas été enregistré. Crée-en un en lecture seule : Contents et Pull requests sur Read-only, rien d'autre.`);
          base.connecterDepot(projet.id, nom, jeton);
        }
        base.mesure("depot");
        const connecte = base.trouver(projet.id, u.id)!;
        lancerLecture(connecte, depotDe(connecte)!, u);
        return vue(connecte, u);
      }
      if (un[2] === "/lecture" && m === "POST") {
        const depot = depotDe(projet);
        if (!depot) throw new ErreurHttp(400, "Aucun dépôt n'est connecté à ce projet.");
        lancerLecture(projet, depot, u);
        return vue(projet, u);
      }
      if (un[2]?.startsWith("/cases/") && m === "POST") {
        if (lectures.get(projet.id)?.enCours) throw new ErreurHttp(409, "Une lecture du dépôt est en cours. Corrigez la case quand elle sera terminée.");
        const laCase = projet.arbre?.familles.flatMap((f) => f.themes.flatMap((t) => t.cases)).find((c) => c.id === un[2]!.slice(7));
        if (!projet.arbre || !laCase) throw new ErreurHttp(404, "Case introuvable.");
        const recu = await corps(req);
        if (recu.annuler) annulerCorrection(laCase); else corrigerCase(laCase, recu);
        base.enregistrerCorrection(projet.id, projet.arbre);
        return vue(base.trouver(projet.id, u.id)!, u);
      }
      if (un[2] === "/ajuster" && m === "POST") {
        if (!projet.arbre) throw new ErreurHttp(400, "Dessine d'abord la carte.");
        if (lectures.get(projet.id)?.enCours) throw new ErreurHttp(409, "Une lecture du dépôt est en cours. Ajuste la carte quand elle sera terminée.");
        const recu = await corps(req);
        const remarque = String(recu.remarque ?? "").trim().slice(0, 4000);
        const saisies = projet.questions.map((_, i) => String(Array.isArray(recu.reponses) ? recu.reponses[i] ?? "" : "").trim().slice(0, 2000));
        const nouvelles = projet.questions.map((question, i) => ({ question, reponse: saisies[i] })).filter((r) => r.reponse);
        if (!nouvelles.length && !remarque) throw new ErreurHttp(400, "Réponds à une question ou dis ce qui ne va pas dans la carte.");
        if (ajustements.has(projet.id)) throw new ErreurHttp(409, "Un ajustement est déjà en cours.");
        ajustements.add(projet.id);
        let reserve = false;
        try {
          if (!base.reserverAction(u.id, plafond)) throw new ErreurHttp(429, messagePlafond(plafond));
          reserve = true;
          const dejaPris = [...projet.questions.map((q, i) => (!saisies[i] && projet.reponses[i]?.trim() ? `${q.question} ${projet.reponses[i].trim()}` : "")), ...projet.remarques].filter(Boolean);
          const sansDepot = structuredClone(projet.arbre);
          for (const f of sansDepot.familles) { for (const t of f.themes) t.cases = t.cases.filter((c) => c.origine !== "depot"); f.themes = f.themes.filter((t) => t.cases.length); }
          const brut = await ia.ajusterArbre({ description: projet.description, arbre: sansDepot, nouvelles, dejaPris, remarque });
          const arbre = reprendre(projet.arbre, normaliserArbre(brut, projet.description), !!projet.depot?.sha);
          base.enregistrerAjustement(projet.id, projet.questions.map((_, i) => saisies[i] || projet.reponses[i] || ""), remarque ? [...projet.remarques, remarque] : projet.remarques, arbre);
          reserve = false;
          return vue(base.trouver(projet.id, u.id)!, u);
        } catch (e) {
          if (reserve) base.rendreAction(u.id);
          throw e;
        } finally { ajustements.delete(projet.id); }
      }
      if (un[2] === "/reponses" && m === "POST") {
        const recues = (await corps(req)).reponses;
        const reponses = projet.questions.map((_, i) => String(Array.isArray(recues) ? recues[i] ?? "" : "").slice(0, 2000));
        if (!base.reserverAction(u.id, plafond)) throw new ErreurHttp(429, messagePlafond(plafond));
        try {
          const brut = await ia.genererArbre(projet.description, projet.questions.map((question, i) => ({ question, reponse: reponses[i] })));
          base.enregistrerArbre(projet.id, reponses, normaliserArbre(brut, projet.description));
          return vue(base.trouver(projet.id, u.id)!, u);
        } catch (e) { base.rendreAction(u.id); throw e; }
      }
    }
    throw new ErreurHttp(404, "Adresse inconnue.");
  }

  let gabarit: string | null = null;
  const originePublique = (req: http.IncomingMessage) => {
    const fixe = process.env.TREE_URL_PUBLIQUE?.replace(/\/$/, "");
    if (fixe) return fixe;
    const proto = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost");
    return `${proto}://${host}`;
  };
  async function pageAccueil(origine: string) {
    gabarit ??= await readFile(path.join(PUBLIC, "index.html"), "utf8");
    const valeurs: Record<string, string> = { NOM: echap(NOM_PRODUIT), ORIGINE: echap(origine) };
    for (const [cle, valeur] of Object.entries(textesAccueil(plafond))) valeurs[cle] = echap(valeur);
    return gabarit.replace(/\{\{([A-Z_]+)\}\}/g, (_, k: string) => valeurs[k] ?? "");
  }

  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", CSP);
    if (req.headers["x-forwarded-proto"] === "https") res.setHeader("Strict-Transport-Security", "max-age=15552000");
    const chemin = new URL(req.url ?? "/", "http://x").pathname;
    try {
      if (chemin === "/og.png" && req.method === "GET") {
        const png = await imageLien();
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" }).end(png);
        return;
      }
      if (chemin === "/favicon.svg" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300" }).end(faviconSvg());
        return;
      }
      if (chemin.startsWith("/api/")) {
        const donnees = await api(req, res, chemin);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(donnees));
      } else if (chemin === "/" || chemin === "/index.html") {
        const html = await pageAccueil(originePublique(req));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }).end(html);
      } else {
        const fichier = path.join(PUBLIC, path.normalize(chemin));
        if (!fichier.startsWith(PUBLIC)) throw new ErreurHttp(404, "Introuvable.");
        const contenu = await readFile(fichier).catch(() => { throw new ErreurHttp(404, "Introuvable."); });
        res.writeHead(200, { "Content-Type": TYPES[path.extname(fichier)] ?? "application/octet-stream", "Cache-Control": "no-cache" }).end(contenu);
      }
    } catch (e) {
      const code = e instanceof ErreurHttp ? e.code : e instanceof ErreurIA ? 502 : e instanceof ErreurDepot ? 400 : 500;
      const message = e instanceof ErreurHttp || e instanceof ErreurIA || e instanceof ErreurDepot ? e.message : "Erreur inattendue. Réessaie.";
      if (code === 500) console.error("erreur interne :", e instanceof Error ? e.name : "inconnue");
      if (!res.headersSent) res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ erreur: message }));
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
    console.log(`${NOM_PRODUIT} : http://localhost:${port}${ia.modeDemo ? " (mode démonstration : aucune clé Anthropic)" : ""}`);
    if (!protege) console.log("Aucun mot de passe (APP_PASSWORD) : l'outil n'est accessible que depuis cet ordinateur.");
  });
}
