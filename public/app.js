// Les écrans : projets, décrire, préciser, puis la carte.
import { monterCarte } from "/carte.js";

const vue = document.getElementById("vue");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let etat = { connecte: false, modeDemo: false, descriptionDemo: null };

async function api(chemin, corps, methode) {
  const r = await fetch("/api" + chemin, corps !== undefined
    ? { method: methode ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }
    : { method: methode ?? "GET" });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && chemin !== "/connexion") { etat.connecte = false; ecranConnexion(); throw new Error(""); }
  if (!r.ok) throw new Error(d.erreur ?? "Erreur inattendue. Réessayez.");
  return d;
}

const etapes = (n) => `<div class="steps">${["Décrire", "Préciser", "L'arbre"].map((e, i) => `<span>${i === n ? `<b>${e}</b>` : e}</span>`).join("")}</div>`;
const demo = () => etat.modeDemo ? `<p class="note"><b>Mode démonstration.</b> Aucune clé Anthropic n'est configurée : l'outil montre un exemple fixe, quelle que soit la description.</p>` : "";
function page(html) { document.body.className = "page"; vue.innerHTML = `<main>${html}</main>`; }

/** Lance une action longue depuis un bouton : attente visible, erreur lisible. */
async function lancer(bouton, attente, action) {
  const zone = vue.querySelector("#msg"), texte = bouton.textContent;
  bouton.disabled = true; zone.innerHTML = `<p class="wait">${attente}</p>`;
  try { await action(); } catch (e) { zone.innerHTML = e.message ? `<p class="err">${esc(e.message)}</p>` : ""; bouton.disabled = false; bouton.textContent = texte; }
}

function ecranConnexion() {
  page(`<h1>Carte produit</h1><form class="panel"><label>Mot de passe<input type="password" id="mdp" autocomplete="current-password" autofocus></label><div id="msg"></div><button class="btn">Entrer</button></form>`);
  vue.querySelector("form").onsubmit = (e) => { e.preventDefault(); lancer(e.target.querySelector(".btn"), "Vérification…", async () => { await api("/connexion", { motDePasse: vue.querySelector("#mdp").value }); etat.connecte = true; route(); }); };
}

async function ecranProjets() {
  const projets = await api("/projets");
  page(`<h1>Carte produit</h1><p class="sub">Comprendre et piloter le logiciel que vous faites construire, sans lire le code.</p>${demo()}
    <div class="row"><a class="btn" href="#/nouveau" style="text-decoration:none">Nouveau projet</a></div>
    ${projets.length ? `<h2>Vos projets</h2><ul class="list">${projets.map((p) => `<li><a href="#/p/${p.id}"><span>${esc(p.nom)}</span><small>${p.etape === "arbre" ? "Arbre prêt" : "Questions en attente"} · ${new Date(p.creeLe).toLocaleDateString("fr-FR")}</small></a></li>`).join("")}</ul>` : `<p class="sub">Aucun projet pour l'instant.</p>`}`);
}

function ecranDecrire() {
  page(`${etapes(0)}<h1>Décrivez votre projet</h1>
    <p class="sub">Collez ici ce que vous avez déjà écrit : un cahier des charges, un brief, des notes. Avec vos mots, sans mise en forme.</p>${demo()}
    <form class="panel"><label>Description du projet<textarea class="big" id="desc" placeholder="Ce que le produit doit faire, pour qui, ce qui est prévu dans cette version, ce qui ne l'est pas, qui construit quoi…">${esc(etat.descriptionDemo ?? "")}</textarea></label>
    <div id="msg"></div><div class="row"><button class="btn">Continuer</button><a class="btn ghost" href="#/" style="text-decoration:none">Annuler</a></div></form>`);
  vue.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    lancer(e.target.querySelector(".btn"), "Lecture de votre description… Cela peut prendre une minute.", async () => {
      const p = await api("/projets", { description: vue.querySelector("#desc").value });
      location.hash = "#/p/" + p.id;
    });
  };
}

function ecranPreciser(projet) {
  const generer = (bouton, reponses) => lancer(bouton, "L'arbre se dessine… Cela peut prendre une à deux minutes.", async () => {
    monterCarte(vue, await api(`/projets/${projet.id}/reponses`, { reponses }), etat);
  });
  if (!projet.questions.length) {
    page(`${etapes(1)}<h1>Aucune question</h1><p class="sub">Votre description suffit pour dessiner l'arbre.</p><div class="panel"><div id="msg"></div><button class="btn" id="go">Générer l'arbre</button></div>`);
    vue.querySelector("#go").onclick = (e) => generer(e.target, []);
    return;
  }
  page(`${etapes(1)}<h1>Quelques précisions</h1>
    <p class="sub">Ces réponses changent la forme de l'arbre. Une ou deux phrases suffisent. Vous pouvez laisser une réponse vide : l'outil ne supposera rien.</p>
    <form class="panel">${projet.questions.map((q, i) => `<label>${i + 1}. ${esc(q.question)}<small>${esc(q.pourquoi)}</small><textarea rows="2" data-q="${i}"></textarea></label>`).join("")}
    <div id="msg"></div><div class="row"><button class="btn">Générer l'arbre</button></div></form>`);
  vue.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    generer(e.target.querySelector(".btn"), [...vue.querySelectorAll("[data-q]")].map((t) => t.value));
  };
}

async function route() {
  const h = location.hash;
  try {
    if (!etat.connecte) return ecranConnexion();
    if (h === "#/nouveau") return ecranDecrire();
    const m = /^#\/p\/([\w-]+)$/.exec(h);
    if (m) {
      const projet = await api("/projets/" + m[1]);
      return projet.etape === "arbre" ? monterCarte(vue, projet, etat) : ecranPreciser(projet);
    }
    await ecranProjets();
  } catch (e) {
    if (e.message) page(`<h1>Carte produit</h1><p class="err">${esc(e.message)}</p><a class="btn ghost" href="#/" style="text-decoration:none">Retour aux projets</a>`);
  }
}

etat = await (await fetch("/api/etat")).json();
addEventListener("hashchange", route);
route();
