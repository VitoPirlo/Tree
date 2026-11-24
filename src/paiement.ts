// Paiement unique, mode test seulement. Aucune clé réelle n'est acceptée.
import type Stripe from "stripe";
import type { Base } from "./base.ts";
import { NOM_PRODUIT } from "./marque.ts";
import { echeance, formule, FORMULES, prixCentimes, type Formule, type IdPack } from "./packs.ts";

export function cleDeTest(cle: string): boolean {
  return cle.startsWith("sk_test_");
}

export interface DemandeSession {
  utilisateurId: string;
  email: string;
  pack: Formule;
  centimes: number;
  renonciationLe: string;
  succes: string;
  annulation: string;
}

/** Ce qu'on envoie à Stripe. Le reçu part par e-mail, depuis Stripe. */
export function parametresSession(d: DemandeSession): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    customer_email: d.email.includes("@") && !d.email.endsWith("@localhost") ? d.email : undefined,
    client_reference_id: d.utilisateurId,
    success_url: d.succes,
    cancel_url: d.annulation,
    metadata: {
      utilisateur: d.utilisateurId,
      pack: d.pack.id,
      renonciation_le: d.renonciationLe,
    },
    payment_intent_data: {
      receipt_email: d.email.includes("@") && !d.email.endsWith("@localhost") ? d.email : undefined,
      metadata: { utilisateur: d.utilisateurId, pack: d.pack.id },
    },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: d.centimes,
        product_data: {
          name: `${NOM_PRODUIT}, pack ${d.pack.nom} (paiement unique, sans abonnement)`,
          description: d.pack.resume,
        },
      },
    }],
  };
}

export interface EvenementCredit {
  type: string;
  sessionId?: string;
  paiement?: string;
  utilisateurId?: string;
  pack?: string;
  paye?: boolean;
}

/** Crédite une fois, ou retire le lot en cas de remboursement. Ne relit jamais le corps d'un projet. */
export function appliquerPaiement(base: Base, e: EvenementCredit, maintenant = new Date()): { fait: "credite" | "deja" | "retire" | "ignore" } {
  if (e.type === "checkout.session.completed" && e.paye && e.sessionId && e.utilisateurId && e.pack) {
    const f = formule(e.pack);
    if (!f) return { fait: "ignore" };
    if (f.id === "recharge") {
      const fin = base.echeanceActive(e.utilisateurId, maintenant.toISOString());
      if (!fin) return { fait: "ignore" };
      const ok = base.ajouterCredit({
        utilisateurId: e.utilisateurId, pack: "recharge", cartes: 0, redessins: 0, lectures: f.lectures,
        fichiersMax: Math.max(f.fichiersMax, fin.fichiersMax), expireLe: fin.expireLe,
        sessionStripe: e.sessionId, paiement: e.paiement ?? null,
      });
      return { fait: ok ? "credite" : "deja" };
    }
    const ok = base.ajouterCredit({
      utilisateurId: e.utilisateurId, pack: f.id, cartes: f.cartes, redessins: f.redessins, lectures: f.lectures,
      fichiersMax: f.fichiersMax, expireLe: echeance(maintenant, f),
      sessionStripe: e.sessionId, paiement: e.paiement ?? null,
    });
    return { fait: ok ? "credite" : "deja" };
  }
  if (e.type === "charge.refunded" && e.paiement) {
    return { fait: base.retirerPaiement(e.paiement) ? "retire" : "ignore" };
  }
  return { fait: "ignore" };
}

export function evenementDepuisStripe(event: { type: string; data: { object: any } }): EvenementCredit {
  const o = event.data.object;
  if (event.type === "checkout.session.completed") {
    const paiement = typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent?.id;
    return {
      type: event.type, sessionId: o.id, paiement, utilisateurId: o.metadata?.utilisateur, pack: o.metadata?.pack,
      paye: o.payment_status === "paid",
    };
  }
  if (event.type === "charge.refunded") {
    const paiement = typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent?.id;
    return { type: event.type, paiement };
  }
  return { type: event.type };
}

export function prixPour(base: Base, f: Formule): number {
  return prixCentimes(f, f.id === "essentiel" ? base.compterPack("essentiel") : 0);
}

export const PACKS_IDS = Object.keys(FORMULES) as IdPack[];
