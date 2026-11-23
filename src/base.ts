// Stockage : un simple fichier SQLite. Suffisant pour un seul utilisateur.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Arbre, Question } from "./arbre.ts";

export interface Projet {
  id: string; nom: string; description: string; etape: "questions" | "arbre";
  questions: Question[]; reponses: string[]; arbre: Arbre | null; demo: boolean; creeLe: string;
}

export function ouvrirBase(fichier?: string) {
  const dossier = process.env.DATA_DIR ?? "data";
  if (!fichier) { mkdirSync(dossier, { recursive: true }); fichier = path.join(dossier, "carte-produit.sqlite"); }
  const db = new DatabaseSync(fichier);
  db.exec(`CREATE TABLE IF NOT EXISTS projets (
    id TEXT PRIMARY KEY, nom TEXT NOT NULL, description TEXT NOT NULL, etape TEXT NOT NULL,
    questions TEXT NOT NULL, reponses TEXT NOT NULL, arbre TEXT, demo INTEGER NOT NULL, cree_le TEXT NOT NULL)`);

  const lire = (r: any): Projet => ({
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
      const p: Projet = { id: randomUUID().slice(0, 12), nom: "Nouveau projet", description, etape: "questions", questions, reponses: [], arbre: null, demo, creeLe: new Date().toISOString() };
      db.prepare("INSERT INTO projets VALUES (?,?,?,?,?,?,?,?,?)").run(p.id, p.nom, p.description, p.etape, JSON.stringify(questions), "[]", null, demo ? 1 : 0, p.creeLe);
      return p;
    },
    enregistrerArbre(id: string, reponses: string[], arbre: Arbre) {
      db.prepare("UPDATE projets SET etape='arbre', nom=?, reponses=?, arbre=? WHERE id=?").run(arbre.produit.nom, JSON.stringify(reponses), JSON.stringify(arbre), id);
    },
    supprimer(id: string) { db.prepare("DELETE FROM projets WHERE id = ?").run(id); },
  };
}
export type Base = ReturnType<typeof ouvrirBase>;
