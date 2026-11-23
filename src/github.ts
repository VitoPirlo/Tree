// Lecture d'un dépôt GitHub. Ce fichier ne sait faire que des lectures (GET) : il ne peut pas écrire dans le dépôt.
import type { DemandeFusion } from "./etats.ts";

export class ErreurDepot extends Error {}

export interface InfoDepot { nom: string; brancheDefaut: string; sha: string; dateDernierCommit: string; ecriturePossible: boolean }
export interface Fichier { chemin: string; sha: string; taille: number }

export interface Depot {
  info(): Promise<InfoDepot>;
  fichiers(sha: string): Promise<Fichier[]>;
  branches(): Promise<string[]>;
  fusions(): Promise<DemandeFusion[]>;
  /** Contenu d'un fichier, par son empreinte : une même empreinte a toujours le même contenu, donc on peut le garder en cache. */
  contenu(shaFichier: string): Promise<string>;
}

/** Accepte « proprietaire/nom » ou une adresse github.com. */
export function lireNomDepot(saisie: string): string {
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(saisie.trim());
  if (!m) throw new ErreurDepot("Nom de dépôt illisible. Écrivez-le sous la forme proprietaire/nom.");
  return `${m[1]}/${m[2]}`;
}

const MAX_FUSIONS = 300;

export class DepotGitHub implements Depot {
  constructor(private nom: string, private jeton: string, private api = "https://api.github.com") {}

  private async lire(chemin: string): Promise<any> {
    const r = await fetch(`${this.api}${chemin}`, {
      method: "GET",
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "carte-produit", ...(this.jeton ? { Authorization: `Bearer ${this.jeton}` } : {}) },
    }).catch(() => { throw new ErreurDepot("Impossible de joindre GitHub. Réessayez."); });
    if (r.status === 401) throw new ErreurDepot("GitHub refuse ce jeton. Vérifiez qu'il est bien copié et qu'il n'a pas expiré.");
    if (r.status === 404) throw new ErreurDepot("Dépôt introuvable. Vérifiez son nom, et que le jeton y donne accès.");
    if (r.status === 429 || (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0")) throw new ErreurDepot("GitHub limite le nombre de lectures pour l'instant. Réessayez dans quelques minutes.");
    if (r.status === 403) throw new ErreurDepot("GitHub refuse l'accès à ce dépôt. Vérifiez que le jeton autorise la lecture du contenu et des demandes de fusion.");
    if (!r.ok) throw new ErreurDepot(`GitHub a répondu par une erreur (code ${r.status}).`);
    return r.json();
  }

  private async pages(chemin: string, max: number): Promise<any[]> {
    const tout: any[] = [];
    for (let page = 1; tout.length < max; page++) {
      const lot = await this.lire(`${chemin}${chemin.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      tout.push(...lot);
      if (lot.length < 100) break;
    }
    return tout.slice(0, max);
  }

  async info(): Promise<InfoDepot> {
    const d = await this.lire(`/repos/${this.nom}`);
    const b = await this.lire(`/repos/${this.nom}/branches/${encodeURIComponent(d.default_branch)}`);
    return { nom: d.full_name, brancheDefaut: d.default_branch, sha: b.commit.sha, dateDernierCommit: String(b.commit.commit?.committer?.date ?? "").slice(0, 10), ecriturePossible: !!d.permissions?.push };
  }

  async fichiers(sha: string): Promise<Fichier[]> {
    const d = await this.lire(`/repos/${this.nom}/git/trees/${sha}?recursive=1`);
    return d.tree.filter((e: any) => e.type === "blob").map((e: any) => ({ chemin: e.path, sha: e.sha, taille: e.size ?? 0 }));
  }

  async branches(): Promise<string[]> {
    return (await this.pages(`/repos/${this.nom}/branches`, 300)).map((b) => b.name);
  }

  async fusions(): Promise<DemandeFusion[]> {
    const brut = await this.pages(`/repos/${this.nom}/pulls?state=all&sort=created&direction=desc`, MAX_FUSIONS);
    return brut.map((p) => ({
      numero: p.number, titre: p.title, auteur: p.user?.login ?? "inconnu",
      etat: p.merged_at ? "fusionnee" : p.state === "open" ? "ouverte" : "fermee",
      date: String(p.merged_at ?? p.created_at ?? "").slice(0, 10), branche: p.head?.ref ?? "", corps: String(p.body ?? "").slice(0, 600),
    }));
  }

  async contenu(shaFichier: string): Promise<string> {
    const d = await this.lire(`/repos/${this.nom}/git/blobs/${shaFichier}`);
    return Buffer.from(d.content, d.encoding === "base64" ? "base64" : "utf8").toString("utf8");
  }
}
