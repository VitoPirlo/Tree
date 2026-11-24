// Stockage : un fichier SQLite. Chaque accès ne voit que ses projets.
// Le fichier s'appelle encore carte-produit.sqlite : les données déjà en ligne restent au même endroit.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import type { Arbre, Question } from "./arbre.ts";
import type { ResultatLecture } from "./lecture.ts";

/** Le dépôt connecté à un projet. Le jeton n'en fait pas partie : il ne quitte jamais le serveur. */
export type DepotConnecte = { nom: string } & Partial<ResultatLecture["depot"]>;

export interface Projet {
  id: string; nom: string; description: string; etape: "questions" | "arbre";
  questions: Question[]; reponses: string[]; arbre: Arbre | null; demo: boolean; creeLe: string;
  /** Ce que l'utilisateur a écrit avec ses mots pour dire ce qui n'allait pas dans l'arbre. */
  remarques: string[];
  depot: DepotConnecte | null;
}

export interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  /** Vrai pour le compte qui récupère les projets d'avant les accès séparés, et qui voit les compteurs. */
  proprietaire: boolean;
  actions: number;
  /** Présent seulement pour un accès inscrit. Le propriétaire se connecte avec APP_PASSWORD, non stocké. */
  hash: string | null;
}

export type Mesure = "visite" | "arbre" | "depot";

export function ouvrirBase(fichier?: string) {
  const dossier = process.env.DATA_DIR ?? "data";
  if (!fichier) { mkdirSync(dossier, { recursive: true }); fichier = path.join(dossier, "carte-produit.sqlite"); }
  const db = new DatabaseSync(fichier);
  db.exec(`CREATE TABLE IF NOT EXISTS projets (
    id TEXT PRIMARY KEY, nom TEXT NOT NULL, description TEXT NOT NULL, etape TEXT NOT NULL,
    questions TEXT NOT NULL, reponses TEXT NOT NULL, arbre TEXT, demo INTEGER NOT NULL, cree_le TEXT NOT NULL)`);

  // Colonnes ajoutées après coup : les bases déjà en service ne les ont pas.
  try { db.exec("ALTER TABLE projets ADD COLUMN remarques TEXT"); } catch { /* elle existe déjà */ }
  try { db.exec("ALTER TABLE projets ADD COLUMN utilisateur_id TEXT"); } catch { /* elle existe déjà */ }
  db.exec(`CREATE TABLE IF NOT EXISTS depots (projet_id TEXT PRIMARY KEY, nom TEXT NOT NULL, jeton TEXT NOT NULL, info TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS cache (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS utilisateurs (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nom TEXT NOT NULL, hash TEXT,
    proprietaire INTEGER NOT NULL, actions_ia INTEGER NOT NULL DEFAULT 0, cree_le TEXT NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, utilisateur_id TEXT NOT NULL, cree_le TEXT NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS essais (cle TEXT PRIMARY KEY, n INTEGER NOT NULL, debut INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS mesures (cle TEXT PRIMARY KEY, n INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS invitations (code TEXT PRIMARY KEY, utilise_par TEXT)`);

  const depotDe = (id: string): DepotConnecte | null => {
    const d: any = db.prepare("SELECT nom, info FROM depots WHERE projet_id = ?").get(id);
    return d ? { nom: d.nom, ...(d.info ? JSON.parse(d.info) : {}) } : null;
  };
  const lire = (r: any): Projet => ({
    depot: depotDe(r.id),
    id: r.id, nom: r.nom, description: r.description, etape: r.etape,
    questions: JSON.parse(r.questions), reponses: JSON.parse(r.reponses), remarques: r.remarques ? JSON.parse(r.remarques) : [],
    arbre: r.arbre ? JSON.parse(r.arbre) : null, demo: !!r.demo, creeLe: r.cree_le,
  });
  const utilisateur = (r: any): Utilisateur => ({
    id: r.id, email: r.email, nom: r.nom, proprietaire: !!r.proprietaire, actions: r.actions_ia, hash: r.hash ?? null,
  });
  const hashJeton = (brut: string) => createHash("sha256").update(brut).digest("hex");

  return {
    fermer() { db.close(); },
    assurerProprietaire(email: string): Utilisateur {
      const existe = db.prepare("SELECT id FROM utilisateurs WHERE id = 'proprietaire'").get();
      if (!existe) {
        db.prepare("INSERT INTO utilisateurs VALUES (?,?,?,?,?,?,?)").run("proprietaire", email, "Propriétaire", null, 1, 0, new Date().toISOString());
      } else {
        try { db.prepare("UPDATE utilisateurs SET email = ?, proprietaire = 1 WHERE id = 'proprietaire'").run(email); } catch { /* adresse déjà prise : on garde l'ancienne */ }
      }
      return this.trouverUtilisateur("proprietaire")!;
    },
    assurerLocal(): Utilisateur {
      if (!db.prepare("SELECT id FROM utilisateurs WHERE id = 'local'").get()) {
        db.prepare("INSERT INTO utilisateurs VALUES (?,?,?,?,?,?,?)").run("local", "local@localhost", "Cet ordinateur", null, 1, 0, new Date().toISOString());
      }
      return this.trouverUtilisateur("local")!;
    },
    /** Projets d'avant les accès séparés : ils n'avaient pas de propriétaire. */
    rattacherOrphelins(utilisateurId: string) {
      db.prepare("UPDATE projets SET utilisateur_id = ? WHERE utilisateur_id IS NULL").run(utilisateurId);
    },
    /** Déplace les projets d'un accès vers un autre (le mode local, une fois le mot de passe posé). */
    rattacherCompte(depuis: string, vers: string) {
      db.prepare("UPDATE projets SET utilisateur_id = ? WHERE utilisateur_id = ?").run(vers, depuis);
    },
    trouverUtilisateur(id: string): Utilisateur | null {
      const r = db.prepare("SELECT * FROM utilisateurs WHERE id = ?").get(id);
      return r ? utilisateur(r) : null;
    },
    trouverParEmail(email: string): Utilisateur | null {
      const r = db.prepare("SELECT * FROM utilisateurs WHERE email = ?").get(email);
      return r ? utilisateur(r) : null;
    },
    inscrire(email: string, nom: string, hash: string): Utilisateur {
      const id = randomUUID().slice(0, 12);
      db.prepare("INSERT INTO utilisateurs VALUES (?,?,?,?,?,?,?)").run(id, email, nom, hash, 0, 0, new Date().toISOString());
      return this.trouverUtilisateur(id)!;
    },
    ouvrirSession(utilisateurId: string): string {
      const brut = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(hashJeton(brut), utilisateurId, new Date().toISOString());
      return brut;
    },
    fermerSession(brut: string) {
      if (!/^[0-9a-f]{64}$/.test(brut)) return;
      db.prepare("DELETE FROM sessions WHERE hash = ?").run(hashJeton(brut));
    },
    session(brut: string): Utilisateur | null {
      if (!/^[0-9a-f]{64}$/.test(brut)) return null;
      const r = db.prepare("SELECT u.* FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur_id WHERE s.hash = ?").get(hashJeton(brut));
      return r ? utilisateur(r) : null;
    },
    /** Réserve une action d'essai. Faux si le plafond est déjà atteint. Atomique. */
    reserverAction(id: string, plafond: number): boolean {
      return db.prepare("UPDATE utilisateurs SET actions_ia = actions_ia + 1 WHERE id = ? AND actions_ia < ?").run(id, plafond).changes === 1;
    },
    rendreAction(id: string) {
      db.prepare("UPDATE utilisateurs SET actions_ia = MAX(actions_ia - 1, 0) WHERE id = ?").run(id);
    },
    bloque(cle: string, maintenant: number, fenetre: number, max: number): boolean {
      const e: any = db.prepare("SELECT n, debut FROM essais WHERE cle = ?").get(cle);
      if (!e) return false;
      if (maintenant - e.debut > fenetre) { db.prepare("DELETE FROM essais WHERE cle = ?").run(cle); return false; }
      return e.n >= max;
    },
    noterEchec(cle: string, maintenant: number, fenetre: number) {
      const e: any = db.prepare("SELECT n, debut FROM essais WHERE cle = ?").get(cle);
      if (!e || maintenant - e.debut > fenetre) {
        db.prepare("INSERT INTO essais (cle, n, debut) VALUES (?,?,?) ON CONFLICT(cle) DO UPDATE SET n = 1, debut = excluded.debut").run(cle, 1, maintenant);
        return;
      }
      db.prepare("UPDATE essais SET n = n + 1 WHERE cle = ?").run(cle);
    },
    reinitialiserEchecs(cle: string) {
      db.prepare("DELETE FROM essais WHERE cle = ?").run(cle);
    },
    chargerCodes(codes: string[]) {
      for (const code of codes) db.prepare("INSERT OR IGNORE INTO invitations (code) VALUES (?)").run(code);
    },
    /** Pose une réservation vide sur le code. Faux s'il est inconnu ou déjà pris. */
    reserverCode(code: string): boolean {
      return db.prepare("UPDATE invitations SET utilise_par = '' WHERE code = ? AND utilise_par IS NULL").run(code).changes === 1;
    },
    confirmerCode(code: string, utilisateurId: string) {
      db.prepare("UPDATE invitations SET utilise_par = ? WHERE code = ?").run(utilisateurId, code);
    },
    libererCode(code: string) {
      db.prepare("UPDATE invitations SET utilise_par = NULL WHERE code = ? AND utilise_par = ''").run(code);
    },
    mesure(cle: Mesure) {
      db.prepare("INSERT INTO mesures (cle, n) VALUES (?, 1) ON CONFLICT(cle) DO UPDATE SET n = n + 1").run(cle);
    },
    mesures(): Record<Mesure, number> {
      const m: Record<Mesure, number> = { visite: 0, arbre: 0, depot: 0 };
      for (const l of db.prepare("SELECT cle, n FROM mesures").all() as any[]) if (l.cle in m) m[l.cle as Mesure] = l.n;
      return m;
    },
    lister(utilisateurId: string): Projet[] {
      return db.prepare("SELECT * FROM projets WHERE utilisateur_id = ? ORDER BY cree_le DESC").all(utilisateurId).map(lire);
    },
    trouver(id: string, utilisateurId: string): Projet | null {
      const r = db.prepare("SELECT * FROM projets WHERE id = ? AND utilisateur_id = ?").get(id, utilisateurId);
      return r ? lire(r) : null;
    },
    creer(utilisateurId: string, description: string, questions: Question[], demo: boolean): Projet {
      const p: Projet = { id: randomUUID().slice(0, 12), nom: "Nouveau projet", description, etape: "questions", questions, reponses: [], remarques: [], arbre: null, demo, creeLe: new Date().toISOString(), depot: null };
      db.prepare("INSERT INTO projets (id, nom, description, etape, questions, reponses, arbre, demo, cree_le, utilisateur_id) VALUES (?,?,?,?,?,?,?,?,?,?)").run(p.id, p.nom, p.description, p.etape, JSON.stringify(questions), "[]", null, demo ? 1 : 0, p.creeLe, utilisateurId);
      return p;
    },
    enregistrerArbre(id: string, reponses: string[], arbre: Arbre) {
      db.prepare("UPDATE projets SET etape='arbre', nom=?, reponses=?, arbre=? WHERE id=?").run(arbre.produit.nom, JSON.stringify(reponses), JSON.stringify(arbre), id);
    },
    supprimer(id: string, utilisateurId: string) {
      const r = db.prepare("DELETE FROM projets WHERE id = ? AND utilisateur_id = ?").run(id, utilisateurId);
      if (r.changes) db.prepare("DELETE FROM depots WHERE projet_id = ?").run(id);
      return r.changes === 1;
    },
    connecterDepot(id: string, nom: string, jeton: string) {
      db.prepare("INSERT INTO depots VALUES (?,?,?,NULL) ON CONFLICT(projet_id) DO UPDATE SET nom=excluded.nom, jeton=excluded.jeton, info=NULL").run(id, nom, jeton);
    },
    jeton(id: string): string | null {
      const d: any = db.prepare("SELECT jeton FROM depots WHERE projet_id = ?").get(id);
      return d ? d.jeton : null;
    },
    enregistrerLecture(id: string, r: ResultatLecture) {
      db.prepare("UPDATE projets SET arbre=? WHERE id=?").run(JSON.stringify(r.arbre), id);
      db.prepare("UPDATE depots SET info=? WHERE projet_id=?").run(JSON.stringify(r.depot), id);
    },
    /** Enregistre l'arbre ajusté, avec les réponses et les remarques qui l'ont fait changer. */
    enregistrerAjustement(id: string, reponses: string[], remarques: string[], arbre: Arbre) {
      db.prepare("UPDATE projets SET nom=?, reponses=?, remarques=?, arbre=? WHERE id=?").run(arbre.produit.nom, JSON.stringify(reponses), JSON.stringify(remarques), JSON.stringify(arbre), id);
    },
    /** Enregistre l'arbre après une correction à la main, sans toucher au reste. */
    enregistrerCorrection(id: string, arbre: Arbre) {
      db.prepare("UPDATE projets SET arbre=? WHERE id=?").run(JSON.stringify(arbre), id);
    },
    cache: {
      lire(cle: string): string | null {
        const c: any = db.prepare("SELECT valeur FROM cache WHERE cle = ?").get(cle);
        return c ? c.valeur : null;
      },
      ecrire(cle: string, valeur: string) { db.prepare("INSERT OR REPLACE INTO cache VALUES (?,?)").run(cle, valeur); },
    },
  };
}
export type Base = ReturnType<typeof ouvrirBase>;
