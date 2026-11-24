// Image 1200×630 et favicon, dessinés à partir du nom dans marque.ts.
// Aucune police du système n'est requise : les fichiers DejaVu voyagent avec le dépôt
// (voir polices/LICENCE-DejaVu.txt), donc l'image Docker les a aussi.
import { Writable } from "node:stream";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PImage from "pureimage";
import { DESCRIPTION_COURTE, NOM_PRODUIT, PHRASE } from "./marque.ts";

const LARGEUR = 1200;
const HAUTEUR = 630;

function cheminPolice(nom: string): string {
  const embarquee = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "polices", nom);
  if (existsSync(embarquee)) return embarquee;
  const systeme = `/usr/share/fonts/truetype/dejavu/${nom}`;
  if (existsSync(systeme)) return systeme;
  throw new Error(`Police introuvable : ${nom}`);
}

let policesPretes = false;
function assurerPolices() {
  if (policesPretes) return;
  PImage.registerFont(cheminPolice("DejaVuSans-Bold.ttf"), "dejavu-bold").loadSync();
  PImage.registerFont(cheminPolice("DejaVuSans.ttf"), "dejavu").loadSync();
  policesPretes = true;
}

function lignes(ctx: { measureText(t: string): { width: number } }, texte: string, max: number): string[] {
  const out: string[] = [];
  let ligne = "";
  for (const mot of texte.split(" ")) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ligne && ctx.measureText(essai).width > max) { out.push(ligne); ligne = mot; }
    else ligne = essai;
  }
  if (ligne) out.push(ligne);
  return out;
}

function dessiner(): Promise<Buffer> {
  assurerPolices();
  const img = PImage.make(LARGEUR, HAUTEUR);
  const ctx = img.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);
  ctx.fillStyle = "#e6e9ee";
  for (let y = 18; y < HAUTEUR; y += 24) for (let x = 18; x < LARGEUR; x += 24) ctx.fillRect(x, y, 2, 2);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let taille = 68;
  ctx.fillStyle = "#1b1f2a";
  ctx.font = `${taille}pt dejavu-bold`;
  while (taille > 32 && ctx.measureText(NOM_PRODUIT).width > 680) {
    taille -= 4;
    ctx.font = `${taille}pt dejavu-bold`;
  }
  ctx.fillText(NOM_PRODUIT, 72, 78);

  ctx.font = "22pt dejavu";
  ctx.fillStyle = "#3c4453";
  const phrase = lignes(ctx, PHRASE, 680);
  phrase.forEach((l, i) => ctx.fillText(l, 72, 78 + taille + 36 + i * 40));

  const yEtapes = 430;
  const etapes = ["Décrire le produit", "Voir la carte", "Relier GitHub"];
  etapes.forEach((etape, i) => {
    const x = 72 + i * 230;
    ctx.fillStyle = "#1b1f2a";
    ctx.beginPath();
    ctx.arc(x + 16, yEtapes + 16, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "16pt dejavu-bold";
    ctx.fillText(String(i + 1), x + 10, yEtapes + 6);
    ctx.fillStyle = "#1b1f2a";
    ctx.font = "16pt dejavu";
    ctx.fillText(etape, x + 42, yEtapes + 6);
  });

  ctx.font = "13pt dejavu";
  ctx.fillStyle = "#6b7480";
  const bas = lignes(ctx, DESCRIPTION_COURTE, 680);
  bas.slice(0, 2).forEach((l, i) => ctx.fillText(l, 72, 510 + i * 24));

  // Mini arbre, à droite : le produit, puis trois cases, sans qu'ils se recouvrent.
  const couleurs = ["#2f6fed", "#7048e8", "#e8590c"];
  const cx = 860;
  const cy = 250;
  ctx.fillStyle = "#1b1f2a";
  ctx.beginPath();
  ctx.arc(cx, cy, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "13pt dejavu-bold";
  const etiquette = NOM_PRODUIT.length > 10 ? NOM_PRODUIT.slice(0, 9) + "…" : NOM_PRODUIT;
  const largeur = ctx.measureText(etiquette).width;
  ctx.fillText(etiquette, cx - largeur / 2, cy - 10);
  ctx.fillStyle = "#cfd4dc";
  ctx.fillRect(cx + 52, cy - 2, 36, 4);

  couleurs.forEach((c, i) => {
    const y = 128 + i * 92;
    ctx.fillStyle = c;
    ctx.fillRect(960, y, 168, 56);
    ctx.fillStyle = "#ffffff";
    ctx.font = "14pt dejavu-bold";
    ctx.fillText(["Fait", "En cours", "À débloquer"][i], 976, y + 16);
  });

  return encoder(img);
}

function encoder(img: unknown): Promise<Buffer> {
  const morceaux: Buffer[] = [];
  const sortie = new Writable({
    write(morceau, _enc, suite) {
      morceaux.push(Buffer.isBuffer(morceau) ? morceau : Buffer.from(morceau));
      suite();
    },
  });
  return PImage.encodePNGToStream(img, sortie).then(() => Buffer.concat(morceaux));
}

let image: Promise<Buffer> | null = null;
/** PNG 1200×630. Le texte vient de marque.ts : changer le nom suffit. */
export function imageLien(): Promise<Buffer> {
  image ??= dessiner();
  return image;
}

export function faviconSvg(): string {
  const titre = NOM_PRODUIT.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <title>${titre}</title>
  <rect width="32" height="32" rx="8" fill="#1b1f2a"/>
  <circle cx="9" cy="16" r="3.2" fill="#ffffff"/>
  <path d="M12 16H18" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="18" y="7" width="9" height="5" rx="1.4" fill="#8eb6ff"/>
  <rect x="18" y="13.5" width="9" height="5" rx="1.4" fill="#ffffff"/>
  <rect x="18" y="20" width="9" height="5" rx="1.4" fill="#ffc9a8"/>
</svg>`;
}
