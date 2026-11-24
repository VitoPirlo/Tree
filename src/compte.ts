// Mots de passe des accès créés par les visiteurs. Le mot de passe propriétaire
// (APP_PASSWORD) n'est pas recopié ici : il reste uniquement dans l'environnement.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const OPTIONS = { N: 16384, r: 8, p: 1 } as const;

export function hacherMotDePasse(mot: string): string {
  const sel = randomBytes(16);
  const hash = scryptSync(mot, sel, 32, OPTIONS);
  return `scrypt$${sel.toString("hex")}$${hash.toString("hex")}`;
}

export function verifierMotDePasse(mot: string, stocke: string): boolean {
  const parts = stocke.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const sel = Buffer.from(parts[1], "hex");
  const attendu = Buffer.from(parts[2], "hex");
  if (sel.length === 0 || attendu.length === 0) return false;
  const calc = scryptSync(mot, sel, attendu.length, OPTIONS);
  return calc.length === attendu.length && timingSafeEqual(calc, attendu);
}

/** Comparaison en temps constant. Deux longueurs différentes ne révèlent pas le secret. */
export function motsEgaux(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}
