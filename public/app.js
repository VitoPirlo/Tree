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

const etapes = (n) => `<div class="steps">${["Décrire", "L'arbre", "Ajuster"].map((e, i) => `<span>${i === n ? `<b>${e}</b>` : e}</span>`).join("")}</div>`;
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

const PROMPT_DESCRIPTION = `Décris le produit sur lequel nous travaillons, pour quelqu'un qui ne lit pas le code. Je vais coller ta réponse dans un outil qui en tire la carte du produit, partie par partie, puis la compare à ce qui est réellement construit.

Décris le produit lui-même : ce qu'il doit faire. Pas la vision, pas le marché, pas les clients visés, pas les arguments de vente.

1. Commence par deux phrases : ce que fait le produit, et pour qui.
2. Liste ensuite ses grandes parties (entre 4 et 8). Pour chacune, écris en phrases simples ce que le produit doit faire pour la personne qui s'en sert. Une chose précise par phrase, que l'on pourra un jour déclarer « faite » ou « pas faite ». Donne les règles chiffrées quand il y en a : durées, limites, délais.
3. Dis ce qui fait partie de cette version, ce qui est repoussé à plus tard, et ce qui est exclu.
4. Dis qui construit quelle partie : personnes, prestataires, agents IA.
5. Dis ce qui ne se fait pas dans le code : démarches, prospection, recrutement.

Décris ce que le produit doit faire, pas ce qui est déjà construit. Même si tu connais le code, ne retire rien parce que ce n'est pas encore fait, et n'ajoute rien parce que le code le fait déjà : l'outil se charge de la comparaison. Si tu ne sais pas ce qui était prévu sur un point, dis-le plutôt que de le déduire du code.

Écris en français, sans jargon technique et sans nom de fichier. Du texte simple, sans tableau, entre 300 et 600 mots.`;

function ecranDecrire() {
  page(`${etapes(0)}<h1>Décrivez votre produit</h1>
    <p class="sub">Dites ce que le produit doit faire, partie par partie. Pas la vision ni le marché : l'outil a besoin de ce qu'il faut construire.</p>${demo()}
    <details class="panel aide" open><summary>Une IA travaille déjà sur votre projet ? Faites-lui écrire la description</summary>
      <p class="sub">Copiez ce prompt, donnez-le à l'IA qui connaît votre projet (Claude, ChatGPT, Cursor…), puis collez sa réponse ci-dessous. Relisez-la : c'est votre description, pas la sienne.</p>
      <pre id="pd"></pre><div class="row"><button type="button" class="btn ghost" id="cpd">Copier le prompt</button></div></details>
    <form class="panel"><label>Description du projet<textarea class="big" id="desc" placeholder="Ce que le produit doit faire, partie par partie, ce qui est prévu dans cette version, ce qui ne l'est pas, qui construit quoi…">${esc(etat.descriptionDemo ?? "")}</textarea></label>
    <div id="msg"></div><div class="row"><button class="btn">Dessiner l'arbre</button><a class="btn ghost" href="#/" style="text-decoration:none">Annuler</a></div></form>`);
  vue.querySelector("#pd").textContent = PROMPT_DESCRIPTION;
  const cpd = vue.querySelector("#cpd");
  cpd.onclick = () => {
    const repli = () => { const r = document.createRange(); r.selectNodeContents(vue.querySelector("#pd")); const g = getSelection(); g.removeAllRanges(); g.addRange(r); cpd.textContent = "Texte sélectionné : copiez-le"; };
    try { navigator.clipboard.writeText(PROMPT_DESCRIPTION).then(() => { cpd.textContent = "Copié"; }, repli); } catch { repli(); }
  };
  vue.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    lancer(e.target.querySelector(".btn"), "Le premier arbre se dessine… Cela prend environ une minute. Vous pourrez l'ajuster ensuite.", async () => {
      const p = await api("/projets", { description: vue.querySelector("#desc").value });
      location.hash = "#/p/" + p.id;
    });
  };
}

function ecranPreciser(projet) {
  const generer = (bouton, reponses) => lancer(bouton, "L'arbre se dessine… Cela peut prendre une à deux minutes.", async () => {
    monterCarte(vue, await api(`/projets/${projet.id}/reponses`, { reponses }), { ...etat, api });
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
      return projet.etape === "arbre" ? monterCarte(vue, projet, { ...etat, api }) : ecranPreciser(projet);
    }
    await ecranProjets();
  } catch (e) {
    if (e.message) page(`<h1>Carte produit</h1><p class="err">${esc(e.message)}</p><a class="btn ghost" href="#/" style="text-decoration:none">Retour aux projets</a>`);
  }
}

etat = await (await fetch("/api/etat")).json();
addEventListener("hashchange", route);
route();
