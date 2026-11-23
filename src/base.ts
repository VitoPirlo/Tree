// Stockage : un simple fichier SQLite. Suffisant pour un seul utilisateur.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Arbre, Question } from "./arbre.ts";
import type { ResultatLecture } from "./lecture.ts";

/** Le dépôt connecté à un projet. Le jeton n'en fait pas partie : il ne quitte jamais le serveur. */
export type DepotConnecte = { nom: string } & Partial<ResultatLecture["depot"]>;

export interface Projet {
  id: string; nom: string; description: string; etape: "questions" | "arbre";
  questions: Question[]; reponses: string[]; arbre: Arbre | null; demo: boolean; creeLe: string;
  depot: DepotConnecte | null;
}

export function ouvrirBase(fichier?: string) {
  const dossier = process.env.DATA_DIR ?? "data";
  if (!fichier) { mkdirSync(dossier, { recursive: true }); fichier = path.join(dossier, "carte-produit.sqlite"); }
  const db = new DatabaseSync(fichier);
  db.exec(`CREATE TABLE IF NOT EXISTS projets (
    id TEXT PRIMARY KEY, nom TEXT NOT NULL, description TEXT NOT NULL, etape TEXT NOT NULL,
    questions TEXT NOT NULL, reponses TEXT NOT NULL, arbre TEXT, demo INTEGER NOT NULL, cree_le TEXT NOT NULL)`);

  db.exec(`CREATE TABLE IF NOT EXISTS depots (projet_id TEXT PRIMARY KEY, nom TEXT NOT NULL, jeton TEXT NOT NULL, info TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS cache (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)`);

  const depotDe = (id: string): DepotConnecte | null => {
    const d: any = db.prepare("SELECT nom, info FROM depots WHERE projet_id = ?").get(id);
    return d ? { nom: d.nom, ...(d.info ? JSON.parse(d.info) : {}) } : null;
  };
  const lire = (r: any): Projet => ({
    depot: depotDe(r.id),
    id: r.id, nom: r.nom, description: r.description, etape: r.etape,
    questions: JSON.parse(r.questions), reponses: JSON.parse(r.reponses),
    arbre: r.arbre ? JSON.parse(r.arbre) : null, demo: !!r.demo, creeLe: r.cree_le,
  });

  return {
    lister(): Projet[] {
      return db.prepare("SELECT * FROM projets ORDER BY cree_le DESC").all().map(lire);
    },
    trouver(id: string): Projet | null {
      const r = db.prepare("SELECT * FROM projets WHERE id = ?").get(id);
      return r ? lire(r) : null;
    },
    creer(description: string, questions: Question[], demo: boolean): Projet {
      const p: Projet = { id: randomUUID().slice(0, 12), nom: "Nouveau projet", description, etape: "questions", questions, reponses: [], arbre: null, demo, creeLe: new Date().toISOString(), depot: null };
      db.prepare("INSERT INTO projets VALUES (?,?,?,?,?,?,?,?,?)").run(p.id, p.nom, p.description, p.etape, JSON.stringify(questions), "[]", null, demo ? 1 : 0, p.creeLe);
      return p;
    },
    enregistrerArbre(id: string, reponses: string[], arbre: Arbre) {
      db.prepare("UPDATE projets SET etape='arbre', nom=?, reponses=?, arbre=? WHERE id=?").run(arbre.produit.nom, JSON.stringify(reponses), JSON.stringify(arbre), id);
    },
    supprimer(id: string) {
      db.prepare("DELETE FROM projets WHERE id = ?").run(id);
      db.prepare("DELETE FROM depots WHERE projet_id = ?").run(id);
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
