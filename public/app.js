// Les écrans : accueil public, accès, projets, décrire, puis la carte.
import { monterCarte } from "/carte.js";

const vue = document.getElementById("vue");
const accueil = document.getElementById("accueil");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let etat = { connecte: false, modeDemo: false, descriptionDemo: null, nom: document.title, phrase: "", confidentialite: "", texteEssai: "", plafond: null, reste: null, mesures: null, codeRequis: false, email: "", proprietaire: false };

async function api(chemin, corps, methode) {
  const r = await fetch("/api" + chemin, corps !== undefined
    ? { method: methode ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }
    : { method: methode ?? "GET" });
  const d = await r.json().catch(() => ({}));
  if (d.essai) { etat.plafond = d.essai.plafond; etat.reste = d.essai.reste; etat.texteEssai = d.essai.texte; }
  if (r.status === 401 && chemin !== "/connexion" && chemin !== "/inscription") { etat.connecte = false; ecranConnexion(); throw new Error(""); }
  if (!r.ok) throw new Error(d.erreur ?? "Erreur inattendue. Réessaie.");
  return d;
}

const etapes = (n) => `<div class="steps">${["Décrire", "La carte", "Ajuster"].map((e, i) => `<span>${i === n ? `<b>${e}</b>` : e}</span>`).join("")}</div>`;
const demo = () => etat.modeDemo ? `<p class="note"><b>Mode démonstration.</b> Aucune clé d'IA n'est configurée : l'outil montre un exemple fixe, quelle que soit la description.</p>` : "";
const essai = () => etat.texteEssai ? `<p class="note">${esc(etat.texteEssai)}</p>` : "";
function montrerAccueil() {
  document.body.className = "page";
  if (accueil) accueil.hidden = false;
  vue.hidden = true;
  scrollTo(0, 0);
}
function montrerApp() {
  if (accueil) accueil.hidden = true;
  vue.hidden = false;
}
function page(html) { montrerApp(); document.body.className = "page"; vue.innerHTML = `<main>${html}</main>`; scrollTo(0, 0); }

/** Lance une action longue depuis un bouton : attente visible, erreur lisible. L'erreur reste à l'écran, elle n'est pas relancée. */
function lancer(bouton, attente, action) {
  const zone = vue.querySelector("#msg"), texte = bouton.textContent;
  bouton.disabled = true; if (zone) zone.innerHTML = `<p class="wait">${attente}</p>`;
  return Promise.resolve(action()).then(() => true, (e) => {
    if (zone) zone.innerHTML = e.message ? `<p class="err">${esc(e.message)}</p>` : "";
    bouton.disabled = false; bouton.textContent = texte;
    return false;
  });
}

async function sortir() {
  await api("/deconnexion", {});
  etat.connecte = false;
  location.hash = "#/";
  montrerAccueil();
}

function ecranConnexion() {
  page(`<p class="marque">${esc(etat.nom)}</p><h1>Entrer</h1><p class="sub">${esc(etat.phrase)}</p>
    <form class="panel"><label>Adresse e-mail<input type="email" id="email" autocomplete="username"></label>
    <label>Mot de passe<input type="password" id="mdp" autocomplete="current-password" autofocus></label>
    <p class="legal">Déjà un accès avec seulement un mot de passe ? Laisse l'adresse vide : c'est le compte qui garde les projets d'avant.</p>
    <div id="msg"></div><button class="btn">Entrer</button></form>
    <p><a href="#/inscription">Créer un accès</a></p>
    <p class="legal">${esc(etat.confidentialite)}</p>`);
  vue.querySelector("form").onsubmit = (e) => { e.preventDefault(); lancer(e.target.querySelector(".btn"), "Vérification…", async () => { await api("/connexion", { email: vue.querySelector("#email").value, motDePasse: vue.querySelector("#mdp").value }); etat.connecte = true; location.hash = "#/"; route(); }); };
}

function ecranInscription() {
  page(`<p class="marque">${esc(etat.nom)}</p><h1>Créer un accès</h1>
    <p class="sub">Chaque accès ne voit que ses propres projets. ${esc(etat.texteEssai)}</p>${demo()}
    <form class="panel"><label>Ton prénom<input id="prenom" autocomplete="given-name" maxlength="80"></label>
    <label>Adresse e-mail<input type="email" id="email" autocomplete="username" required></label>
    <label>Mot de passe<small>8 caractères au moins. Il reste sur ce serveur, sous une forme qu'on ne peut pas relire.</small><input type="password" id="mdp" autocomplete="new-password" minlength="8" required></label>
    ${etat.codeRequis ? `<label>Code d'invitation<input id="code" autocomplete="off" required></label>` : ""}
    <div id="msg"></div><button class="btn">Créer l'accès</button></form>
    <p><a href="#/entrer">J'ai déjà un accès</a></p>
    <p class="legal">${esc(etat.confidentialite)}</p>`);
  vue.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    lancer(e.target.querySelector(".btn"), "Création de l'accès…", async () => {
      await api("/inscription", { nom: vue.querySelector("#prenom").value, email: vue.querySelector("#email").value, motDePasse: vue.querySelector("#mdp").value, code: vue.querySelector("#code")?.value ?? "" });
      etat.connecte = true; location.hash = "#/"; route();
    });
  };
}

async function ecranProjets() {
  const projets = await api("/projets");
  const activite = etat.mesures ? `<p class="sub">Activité, sans aucun texte de projet : ${etat.mesures.visite} visite${etat.mesures.visite > 1 ? "s" : ""}, ${etat.mesures.arbre} carte${etat.mesures.arbre > 1 ? "s" : ""} dessinée${etat.mesures.arbre > 1 ? "s" : ""}, ${etat.mesures.depot} dépôt${etat.mesures.depot > 1 ? "s" : ""} connecté${etat.mesures.depot > 1 ? "s" : ""}.</p>` : "";
  const qui = etat.email && !String(etat.email).endsWith("@localhost") ? `<p class="sub">Accès : ${esc(etat.email)}</p>` : (etat.proprietaire ? `<p class="sub">Accès propriétaire. Les projets déjà présents sont ici.</p>` : "");
  page(`<p class="marque">${esc(etat.nom)}</p><h1>Tes projets</h1><p class="sub">${esc(etat.phrase)}</p>${qui}${demo()}${essai()}${activite}
    <div class="row"><a class="btn" href="#/nouveau" style="text-decoration:none">Nouveau projet</a><button class="btn ghost" id="sortir" type="button">Sortir</button></div>
    ${projets.length ? `<ul class="list">${projets.map((p) => `<li><a href="#/p/${p.id}"><span>${esc(p.nom)}</span><small>${p.etape === "arbre" ? "Carte prête" : "Questions en attente"} · ${new Date(p.creeLe).toLocaleDateString("fr-FR")}</small></a><button class="suppr" type="button" data-suppr="${esc(p.id)}">Supprimer</button></li>`).join("")}</ul>` : `<p class="sub">Aucun projet pour l'instant.</p>`}`);
  vue.querySelector("#sortir").onclick = () => sortir();
  vue.querySelectorAll("[data-suppr]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Supprimer ce projet ? La carte et l'accès GitHub enregistré seront effacés.")) return;
    b.disabled = true;
    await api("/projets/" + b.dataset.suppr, {}, "DELETE");
    route();
  }));
}

const PROMPT_DESCRIPTION = `Tu connais ce projet. Fais comme un développeur qui le reprend et qui pose le plan de travail : « voici les grands chantiers, et dans chacun, les sujets à traiter ». Je vais coller ta réponse dans un outil qui en tire une carte : le produit, ses chantiers, leurs sujets, puis ce qu'il y a à faire dans chaque sujet.

Écris-le dans cet ordre :

1. Deux phrases : ce que fait le produit, et pour qui.

2. Les grands chantiers du projet, entre 4 et 8. Un chantier est une grande partie du produit qu'une personne ou une équipe peut porter : par exemple la collecte des données, l'analyse, l'espace client, la facturation, les outils internes, la mise en production. Donne à chacun un nom court et une phrase sur son enjeu, et dis qui le porte (personne, prestataire, agent IA) si c'est décidé.

3. Dans chaque chantier, les sujets à traiter, entre 2 et 6. Pour chaque sujet, écris en phrases simples ce que le produit doit faire : une chose précise par phrase, que l'on pourra un jour déclarer « faite » ou « pas faite ». Donne les règles chiffrées quand il y en a : durées, limites, délais.

4. Ce qui est repoussé après cette version, et ce qui est exclu.

5. Ce qui ne se fait pas dans le code : démarches, prospection, recrutement.

Couvre tout le projet, y compris ce qui est invisible pour l'utilisateur (fiabilité, sécurité, outils de l'équipe). Liste aussi bien ce qui est déjà construit que ce qui reste à faire, sans dire où en est chaque point : l'outil le vérifiera lui-même dans le code. Si tu ne sais pas ce qui était prévu sur un sujet, dis-le plutôt que de l'inventer.

Écris en français, pour quelqu'un qui ne lit pas le code : sans jargon technique, sans nom de fichier ni de technologie. Pas de vision, de marché ni d'arguments de vente. Du texte simple avec des titres de chantiers, sans tableau, entre 400 et 800 mots.`;

function ecranDecrire() {
  page(`${etapes(0)}<h1>Décris ton produit</h1>
    <p class="sub">Liste les grands chantiers du projet et, dans chacun, les sujets à traiter. Pas la vision ni le marché : l'outil a besoin de ce qu'il faut construire.</p>${demo()}${essai()}
    <details class="panel aide" open><summary>Une IA travaille déjà sur ton projet ? Fais-lui écrire la description</summary>
      <p class="sub">Copie ce prompt, donne-le à l'IA qui connaît ton projet, puis colle sa réponse ci-dessous. Relis-la : c'est ta description, pas la sienne.</p>
      <pre id="pd"></pre><div class="row"><button type="button" class="btn ghost" id="cpd">Copier le prompt</button></div></details>
    <form class="panel"><label>Description du projet<textarea class="big" id="desc" placeholder="Ce que le produit doit faire, partie par partie, ce qui est prévu dans cette version, ce qui ne l'est pas, qui construit quoi…">${esc(etat.descriptionDemo ?? "")}</textarea></label>
    <p class="legal">${esc(etat.confidentialite)}</p>
    <div id="msg"></div><div class="row"><button class="btn">Dessiner la carte</button><a class="btn ghost" href="#/" style="text-decoration:none">Annuler</a></div></form>`);
  vue.querySelector("#pd").textContent = PROMPT_DESCRIPTION;
  const cpd = vue.querySelector("#cpd");
  cpd.onclick = () => {
    const repli = () => { const r = document.createRange(); r.selectNodeContents(vue.querySelector("#pd")); const g = getSelection(); g.removeAllRanges(); g.addRange(r); cpd.textContent = "Texte sélectionné : copie-le"; };
    try { navigator.clipboard.writeText(PROMPT_DESCRIPTION).then(() => { cpd.textContent = "Copié"; }, repli); } catch { repli(); }
  };
  let dessin = false;
  vue.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    if (dessin) return;
    dessin = true;
    const bouton = e.target.querySelector(".btn");
    lancer(bouton, "La première carte se dessine… Cela prend environ une minute. Tu pourras l'ajuster ensuite.", async () => {
      const p = await api("/projets", { description: vue.querySelector("#desc").value });
      location.hash = "#/p/" + p.id;
    }).then((ok) => { if (!ok) dessin = false; });
  };
}

function ecranPreciser(projet) {
  const generer = (bouton, reponses) => lancer(bouton, "La carte se dessine… Cela peut prendre une à deux minutes.", async () => {
    monterCarte(vue, await api(`/projets/${projet.id}/reponses`, { reponses }), optionsCarte(projet.id));
  });
  if (!projet.questions.length) {
    page(`${etapes(1)}<h1>Aucune question</h1><p class="sub">Ta description suffit pour dessiner la carte.</p><div class="panel"><div id="msg"></div><button class="btn" id="go">Dessiner la carte</button></div>`);
    vue.querySelector("#go").onclick = (e) => generer(e.target, []);
    return;
  }
  page(`${etapes(1)}<h1>Quelques précisions</h1>
    <p class="sub">Ces réponses changent la forme de la carte. Une ou deux phrases suffisent. Tu peux laisser une réponse vide : l'outil ne supposera rien.</p>
    <form class="panel">${projet.questions.map((q, i) => `<label>${i + 1}. ${esc(q.question)}<small>${esc(q.pourquoi)}</small><textarea rows="2" data-q="${i}"></textarea></label>`).join("")}
    <div id="msg"></div><div class="row"><button class="btn">Dessiner la carte</button></div></form>`);
  vue.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    generer(e.target.querySelector(".btn"), [...vue.querySelectorAll("[data-q]")].map((t) => t.value));
  };
}

async function ecranTarifs() {
  const recu = await api("/formules");
  const formules = recu.formules;
  const ligne = (f) => {
    const fichiers = Number(f.fichiersMax).toLocaleString("fr-FR");
    if (f.id === "essentiel") return `${f.cartes} carte, ${f.redessins} redessins, ${f.lectures} lectures de ton dépôt, ${f.jours} jours, dépôt jusqu'à ${fichiers} fichiers.`;
    if (f.id === "recharge") return "";
    const cartes = `${f.cartes} carte${f.cartes > 1 ? "s" : ""}`;
    return `${cartes}, ${f.redessins} redessins, ${f.lectures} lectures, ${f.mois} mois, jusqu'à ${fichiers} fichiers.`;
  };
  const accroche = {
    essentiel: "Pour voir enfin où en est ton produit.",
    suivi: "Pour garder un œil sur ton dev pendant des mois.",
    studio: "Pour les gros projets, ou deux produits en parallèle.",
    recharge: "Besoin de plus de lectures ? 5 de plus, et c'est reparti.",
  };
  page(`<p class="marque">${esc(etat.nom)}</p><h1>Un prix, une fois. Zéro abonnement.</h1>
    <p class="sub">Tu paies, tu cartographies, tu suis ton dev. Pas de prélèvement surprise le mois d'après.</p>
    ${formules.map((f) => `<article class="panel formule-carte"><h2>${esc(f.nom)}</h2><p><b>${esc(f.prix)}</b>${f.prixHabituel ? ` <s>${esc(f.prixHabituel)}</s>` : ""}${f.resteLancement != null ? ` <small>${f.resteLancement} places au prix de lancement</small>` : ""}</p><p>${esc(accroche[f.id] ?? f.resume)}</p>${ligne(f) ? `<p class="sub">${esc(ligne(f))}</p>` : ""}<button class="btn" type="button" data-pack="${esc(f.id)}" data-prix="${esc(f.prix)}"${recu.paiementOuvert ? "" : " disabled"}>Je prends ${esc(f.nom)}, ${esc(f.prix)}</button></article>`).join("")}
    <label class="legal"><input type="checkbox" id="renonce"> ${esc(formules[0]?.renonciation ?? "")}</label>
    ${recu.paiementOuvert ? "" : `<p class="note">Le paiement n'est pas encore ouvert.</p>`}
    <div id="msg"></div>
    <a class="btn ghost" href="#/" style="text-decoration:none">Retour</a>
    <p class="legal">${esc(etat.confidentialite)}</p>`);
  vue.querySelectorAll("[data-pack]").forEach((bouton) => (bouton.onclick = () => {
    if (!vue.querySelector("#renonce").checked) { vue.querySelector("#msg").innerHTML = `<p class="err">Coche la case : tu dois demander l'accès tout de suite, et accepter de renoncer à la rétractation.</p>`; return; }
    if (!etat.connecte) { location.hash = "#/entrer"; return; }
    lancer(bouton, "Ouverture du paiement…", async () => {
      const r = await api("/paiement", { pack: bouton.dataset.pack, renonciation: true });
      if (r.url) location.href = r.url;
    });
  }));
}

function ecranMerci() {
  page(`<p class="marque">${esc(etat.nom)}</p><h1>C'est payé !</h1>
    <p>Ton reçu arrive par mail. Allez, on cartographie.</p>
    <a class="btn" href="#/" style="text-decoration:none">Continuer</a>`);
}

function optionsCarte(id) {
  return {
    etat, api,
    sortir,
    supprimer: async () => {
      if (!confirm("Supprimer ce projet ? La carte et l'accès GitHub enregistré seront effacés.")) return;
      await api("/projets/" + id, {}, "DELETE");
      location.hash = "#/";
      route();
    },
  };
}

async function route() {
  const h = location.hash;
  try {
    if (!etat.connecte) {
      if (h === "#/entrer") return ecranConnexion();
      if (h === "#/inscription") return ecranInscription();
      if (h === "#/tarifs") return ecranTarifs();
      if (h === "#/merci") return ecranMerci();
      return montrerAccueil();
    }
    montrerApp();
    if (h === "#/tarifs") return ecranTarifs();
    if (h === "#/merci") return ecranMerci();
    if (h === "#/nouveau") return ecranDecrire();
    const m = /^#\/p\/([\w-]+)$/.exec(h);
    if (m) {
      const projet = await api("/projets/" + m[1]);
      return projet.etape === "arbre" ? monterCarte(vue, projet, optionsCarte(m[1])) : ecranPreciser(projet);
    }
    await ecranProjets();
  } catch (e) {
    if (e.message) page(`<p class="marque">${esc(etat.nom)}</p><h1>Une erreur</h1><p class="err">${esc(e.message)}</p><a class="btn ghost" href="#/" style="text-decoration:none">Retour aux projets</a>`);
  }
}

if (!sessionStorage.getItem("pt-visite")) {
  sessionStorage.setItem("pt-visite", "1");
  fetch("/api/mesure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "visite" }) }).catch(() => {});
}

etat = { ...etat, ...(await (await fetch("/api/etat")).json()) };
if (etat.nom) document.title = etat.nom;
addEventListener("hashchange", route);
route();
