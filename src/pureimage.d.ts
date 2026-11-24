declare module "pureimage" {
  export function registerFont(chemin: string, nom: string): { loadSync(): void };
  export function make(largeur: number, hauteur: number): {
    getContext(type: "2d"): Contexte;
  };
  export function encodePNGToStream(image: unknown, sortie: NodeJS.WritableStream): Promise<void>;
}

interface Contexte {
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a: number, b: number): void;
  fill(): void;
  fillText(texte: string, x: number, y: number): void;
  measureText(texte: string): { width: number };
}
