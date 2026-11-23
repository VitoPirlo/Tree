// La carte : repris du prototype reference/prototype-carte-produit.html, branché sur l'arbre du serveur.
const LABEL = { done: "Débloqué", wip: "En cours", todo: "À débloquer", later: "Après cette version", out: "Hors dépôt" };
const ORDER = { done: 0, wip: 1, todo: 2, later: 3, out: 4 };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

/* une couleur par famille, dans l'ordre */
const COULEURS = [["#2f6fed", "#e9f0ff"], ["#7048e8", "#f0eaff"], ["#e8590c", "#fff0e5"], ["#d6336c", "#ffe9f1"], ["#495057", "#eef0f2"],
  ["#0c8599", "#e2f6f9"], ["#2f9e44", "#e7f7eb"], ["#b8860b", "#fff6d6"], ["#c2255c", "#ffe3ec"], ["#1864ab", "#e2effb"]];
const EMBLEMES = {
  donnees: '<path d="M12 3v11m0 0l-4-4m4 4l4-4M5 17v2a1 1 0 001 1h12a1 1 0 001-1v-2"/>',
  cerveau: '<path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 0V7a3 3 0 00-3-3zm6 0a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 0"/>',
  courrier: '<path d="M4 6h16v12H4zM4 7l8 6 8-6"/>',
  ecran: '<path d="M4 5h16v14H4zM4 9h16M8 13h5"/>',
  serveur: '<path d="M5 5h14v5H5zM5 14h14v5H5zM8 7.5h.01M8 16.5h.01"/>',
  outil: '<path d="M14 6a4 4 0 00-5 5l-5 5 2 2 5-5a4 4 0 005-5l-2.5 2.5-2-2z"/>',
  megaphone: '<path d="M4 10v4h3l6 4V6l-6 4zm12-1a4 4 0 010 6"/>',
  cadenas: '<path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z"/>',
  paiement: '<path d="M3 7h18v11H3zM3 11h18M7 15h3"/>',
  personnes: '<path d="M9 11a3 3 0 100-6 3 3 0 000 6zm-6 8a6 6 0 0112 0M16 5.5a3 3 0 010 5.5m2 3a6 6 0 013 5"/>',
  graphique: '<path d="M4 20V4m0 16h16M8 16v-4m4 4V8m4 8v-6"/>',
  reglages: '<path d="M4 7h10m4 0h2M4 17h2m4 0h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
};
const I = { done: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'), wip: "", todo: svg(EMBLEMES.cadenas), later: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'), out: svg('<path d="M7 17L17 7M9 7h8v8"/>') };

const toutes = (f) => f.themes.flatMap((t) => t.cases);
const stat = (cs) => { const c = { done: 0, wip: 0, todo: 0, later: 0, out: 0, ecarts: 0 }; cs.forEach((n) => { c[n.etat]++; if (n.ecart) c.ecarts++; }); c.tot = c.done + c.wip + c.todo; return c; };
const part = (a, b) => (b ? (a / b) * 100 : 0);

/* géométrie : tout va de gauche à droite. Produit → famille → thème → cases */
const PER = 5, SW = 168, SH = 58, SX = 186, ROWH = 74, FGAP = 34;
const RX = 20, RS = 150, TOP = 84, TRUNK = RX + RS + 30, FX = TRUNK + 30, FW = 216, FH = 74, BUS = FX + FW + 22, GX = BUS + 20, GW = 132, GH = 30, STX = GX + GW + 28;

const dateFr = (d) => { const [a, m, j] = String(d).slice(0, 10).split("-"); return `${j}/${m}/${a}`; };
const nomCourt = (chemin) => chemin.split("/").slice(-2).join("/");

/** Les preuves contrôlées d'une case, pour le volet replié « Où regarder dans le dépôt ». */
function listePreuves(n) {
  if (!n.preuves?.length) return "";
  const li = n.preuves.map((p) => p.type === "fusion"
    ? `<li><span>Demande de fusion n° ${p.numero} · ${esc(p.titre)} <i>${esc(p.auteur)} · ${p.etat === "fusionnee" ? "fusionnée" : "ouverte"} le ${dateFr(p.date)}</i></span></li>`
    : p.type === "branche" ? `<li><span>Branche en chantier : ${esc(p.nom)}</span></li>`
    : `<li><span>${p.type === "test" ? "Test" : "Fichier"} : ${esc(p.chemin)}</span></li>`).join("");
  return `<details class="ev"><summary>Où regarder dans le dépôt (${n.preuves.length} preuve${n.preuves.length > 1 ? "s" : ""} vérifiée${n.preuves.length > 1 ? "s" : ""})</summary><ul style="margin-top:6px">${li}</ul></details>`;
}

export function monterCarte(racine, projet, { modeDemo, api }) {
  let arbre = projet.arbre, F = arbre.familles;
  document.body.className = "";
  racine.innerHTML = `
    <div id="board" aria-label="Arbre du produit ${esc(arbre.produit.nom)}"><div id="layer"></div></div>
    <div class="top">
      <div class="hud">
        <a class="chip" href="#/" aria-label="Retour aux projets">←</a>
        <div class="chip"><h1>${/^carte produit/i.test(arbre.produit.nom) ? "" : "Carte produit "}${esc(arbre.produit.nom)}</h1></div>
        <div class="chip k"><i class="lg"></i><b id="c1"></b> débloqués</div>
        <div class="chip k"><i class="lg w"></i><b id="c2"></b> en cours</div>
        <div class="chip k"><i class="lg t"></i><b id="c3"></b> à débloquer</div>
        ${projet.demo ? '<div class="chip demo">Exemple de démonstration</div>' : ""}
      </div>
      <div class="hud"><button class="tg" id="dt" aria-pressed="false" hidden><i>!</i><span id="dtl"></span></button><button class="tg depot" id="aff"></button><button class="tg depot" id="maj" hidden>Mettre à jour</button><button class="tg depot" id="gh"></button></div>
    </div>
    <div class="zoom" role="group" aria-label="Zoom">
      <button id="zo" aria-label="Dézoomer">−</button><button id="zi" aria-label="Zoomer">+</button><button id="zf">Tout voir</button>
    </div>
    <div class="hint">Glissez pour vous déplacer · cliquez sur une case pour le détail</div>
    <aside class="card" id="card" hidden aria-live="polite"></aside>`;
  const $ = (s) => racine.querySelector(s);
  const board = $("#board"), layer = $("#layer");
  let W = 0, H = 0, sel = null, ecartsOn = false;

  function build() {
    let html = "", lines = "";
    const g = stat(F.flatMap(toutes)), pct = Math.round(part(g.done, g.tot)), C = 2 * Math.PI * 46;
    let y = TOP, lastF = 0;
    const rcy = TOP + RS / 2;
    html += `<button class="nd root" data-k="root" style="left:${RX}px;top:${TOP}px"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="#e6e9ee" stroke-width="7"/><circle cx="50" cy="50" r="46" fill="none" stroke="#1b1f2a" stroke-width="7" stroke-linecap="round" stroke-dasharray="${part(g.done, g.tot) / 100 * C} ${C}"/></svg><em${arbre.produit.nom.length > 11 ? ' style="font-size:11px;max-width:112px;line-height:1.15"' : ""}>${esc(arbre.produit.nom)}</em><b>${pct} %</b><span>${g.done} sur ${g.tot}</span></button>`;
    lines += `<path class="ln" d="M${RX + RS} ${rcy} H${TRUNK}"/>`;
    y = TOP + (RS - FH) / 2;
    F.forEach((f, fi) => {
      const c = stat(toutes(f)), fy = y, fcy = fy + FH / 2, [fc, ft] = COULEURS[fi % COULEURS.length], sty = `--fc:${fc};--ft:${ft}`;
      lines += `<g style="${sty}">` + (fi === 0 ? `<path class="ln" d="M${TRUNK} ${fcy} H${FX}"/>` : `<path class="ln" d="M${TRUNK} ${fcy - 12} Q${TRUNK} ${fcy} ${TRUNK + 12} ${fcy} H${FX}"/>`);
      html += `<button class="nd fam${ecartsOn && !c.ecarts ? " dim" : ""}" data-k="f${fi}" aria-pressed="${sel === "f" + fi}" style="${sty};left:${FX}px;top:${fy}px;width:${FW}px;height:${FH}px">
        <span class="hex">${svg(EMBLEMES[f.embleme] ?? EMBLEMES.reglages)}</span><span class="tx"><b>${esc(f.titre)}</b><span class="xp"><span class="seg"><u style="width:${part(c.done, c.tot)}%"></u><u style="width:${part(c.wip, c.tot)}%"></u></span><i>${c.done}/${c.tot}</i></span></span>${c.ecarts ? `<span class="fl">${c.ecarts}</span>` : ""}</button>`;
      let gy = fy + (FH - SH) / 2, lastG = fcy;
      f.themes.forEach((t, gi) => {
        const steps = t.cases.map((n, i) => ({ ...n, i })).sort((a, z) => ORDER[a.etat] - ORDER[z.etat]);
        const gcy = gy + SH / 2, gs = stat(t.cases), gcl = gs.done ? "done" : "";
        lines += gi === 0 ? `<path class="ln ${gcl}" d="M${FX + FW} ${fcy} H${GX}"/>` : `<path class="ln ${gcl}" d="M${BUS} ${gcy - 12} Q${BUS} ${gcy} ${BUS + 12} ${gcy} H${GX}"/>`;
        lastG = gcy;
        html += `<span class="gp${ecartsOn && !gs.ecarts ? " dim" : ""}" style="${sty};left:${GX}px;top:${gcy - GH / 2}px;width:${GW}px;height:${GH}px" title="${esc(t.titre)}"><span>${esc(t.titre)}</span></span>`;
        steps.forEach((n, k) => {
          const r = Math.floor(k / PER), col = k % PER, x = STX + col * SX, sy = gy + r * ROWH, cy = sy + SH / 2;
          if (col === 0) {
            if (r === 0) lines += `<path class="ln ${n.etat}" d="M${GX + GW} ${gcy} H${x}"/>`;
            else { const ex = GX + GW + 14; lines += `<path class="ln ${n.etat}" d="M${ex} ${gcy} V${cy - 12} Q${ex} ${cy} ${ex + 12} ${cy} H${x}"/>`; }
          } else lines += `<path class="ln ${n.etat}" d="M${x - (SX - SW)} ${cy} H${x}"/>`;
          const key = `s${fi}-${gi}-${n.i}`;
          html += `<button class="nd st ${n.etat}${ecartsOn && !n.ecart ? " dim" : ""}" data-k="${key}" aria-pressed="${sel === key}" aria-label="${esc(n.titre)} : ${LABEL[n.etat]}" style="${sty};left:${x}px;top:${sy}px;width:${SW}px;height:${SH}px"><span class="hex">${I[n.etat]}</span><span>${esc(n.titre)}</span>${n.ecart ? '<i class="fl nv ec" title="Écart avec la description">!</i>' : n.nonVerifie ? '<i class="fl nv" title="Non vérifié">?</i>' : n.corrige ? '<i class="fl nv" title="Corrigé par vous">✎</i>' : ""}</button>`;
        });
        gy += Math.ceil(steps.length / PER) * ROWH + 6;
      });
      if (f.themes.length > 1) lines += `<path class="ln ${c.done ? "done" : ""}" d="M${BUS} ${fcy} V${lastG - 12}"/>`;
      lines += "</g>";
      lastF = fcy; y = gy - 6 + FGAP;
    });
    lines = `<path class="ln" d="M${TRUNK} ${rcy} V${lastF - 12}"/>` + lines;
    W = STX + PER * SX + 4; H = y;
    layer.style.width = W + "px"; layer.style.height = H + "px";
    layer.innerHTML = `<svg class="wires" width="${W}" height="${H}" aria-hidden="true">${lines}</svg>` + html;
    $("#dt").hidden = !g.ecarts; $("#dtl").textContent = `${g.ecarts} écart${g.ecarts > 1 ? "s" : ""} avec la description`;
    $("#dt").setAttribute("aria-pressed", ecartsOn);
    $("#c1").textContent = g.done; $("#c2").textContent = g.wip; $("#c3").textContent = g.todo;
  }

  /* fiche */
  function card() {
    const el = $("#card");
    if (!sel) { el.hidden = true; return; }
    let h = '<button class="x" aria-label="Fermer">×</button>';
    if (sel === "root") {
      const g = stat(F.flatMap(toutes));
      const le = new Date(projet.creeLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
      h += `<span class="ey">Le produit</span><h2>${esc(arbre.produit.nom)}</h2><p>${esc(arbre.produit.resume)}</p>
        <p class="ev">${g.done} cases débloquées, ${g.wip} en cours, ${g.todo} à débloquer, ${g.later} prévues après cette version.</p>
        ${projet.depot?.sha
          ? `<p class="ev">Carte établie à partir de votre description et du dépôt ${esc(projet.depot.nom)} (branche ${esc(projet.depot.brancheDefaut)} au ${dateFr(projet.depot.dateDernierCommit)}), lu le ${dateFr(projet.depot.luLe)}. « Débloqué » veut dire construit et testé, pas encore éprouvé en production. Les cases à débloquer sont des propositions de l'outil, déduites de votre description.</p>${projet.depot.fichiersIgnores ? `<p class="ev">Dépôt très volumineux : ${projet.depot.fichiersIgnores} fichiers n'ont pas été pris en compte.</p>` : ""}`
          : `<p class="ev">Carte établie le ${le} à partir de votre description seule. Aucun dépôt n'est connecté : aucune case n'est vérifiée, toutes sont des propositions de l'outil.</p>`}`;
    } else if (sel === "ecarts") {
      h += `<span class="ey">Ce qui existe ne correspond pas à ce que vous avez écrit</span><h2>Écarts avec la description</h2><ul>`;
      F.forEach((f, fi) => f.themes.forEach((t, gi) => t.cases.forEach((n, ni) => { if (n.ecart) h += `<li><button data-go="s${fi}-${gi}-${ni}"><span>${esc(f.titre)} · <b>${esc(n.titre)}</b><br><span class="ev">${esc(n.ecart.constat)}</span></span></button></li>`; })));
      h += "</ul>";
    } else if (sel === "affiner") {
      const qs = projet.questions ?? [], rs = projet.reponses ?? [];
      const ouvertes = qs.map((q, i) => ({ ...q, i })).filter((q) => !rs[q.i]?.trim()), prises = qs.map((q, i) => ({ ...q, i })).filter((q) => rs[q.i]?.trim());
      h += `<span class="ey">Votre arbre, à votre main</span><h2>Ajuster l'arbre</h2>
        <p>Ce premier arbre vient de votre description seule. Répondez à ce que vous voulez, dans l'ordre que vous voulez : l'arbre se redessine en gardant tout ce qui ne change pas.</p>
        <div class="cor">
        ${ouvertes.map((q) => `<label>${esc(q.question)}<small class="ev">${esc(q.pourquoi)}</small><textarea rows="2" data-q="${q.i}" maxlength="2000"></textarea></label>`).join("")}
        <label>${ouvertes.length ? "Autre chose ne va pas dans l'arbre ?" : "Quelque chose ne va pas dans l'arbre ?"}<small class="ev">Dites-le avec vos mots : une partie qui manque, une case de trop, un découpage qui ne vous parle pas.</small><textarea rows="4" id="aff-rem" maxlength="4000"></textarea></label>
        <div id="aff-msg"></div><div class="row-tags"><button class="cp" id="aff-ok">Ajuster l'arbre</button></div></div>
        ${prises.length || projet.remarques?.length ? `<details class="ev"><summary>Déjà pris en compte (${prises.length + (projet.remarques?.length ?? 0)})</summary><ul style="margin-top:6px">${prises.map((q) => `<li><span><b>${esc(q.question)}</b><br>${esc(rs[q.i])}</span></li>`).join("")}${(projet.remarques ?? []).map((r) => `<li><span><b>Votre remarque</b><br>${esc(r)}</span></li>`).join("")}</ul></details>` : ""}`;
    } else if (sel === "depot") {
      const l = projet.lecture, d = projet.depot;
      h += `<span class="ey">Dépôt GitHub · lecture seule</span>`;
      if (l?.enCours) h += `<h2>Lecture en cours</h2><p class="wait">${esc(l.message)}</p><p class="ev">Cela prend quelques minutes. Vous pouvez laisser cette page ouverte.</p>`;
      else if (d?.sha) h += `<h2>${esc(d.nom)}</h2><p>Branche ${esc(d.brancheDefaut)}, dernière modification le ${dateFr(d.dateDernierCommit)}. Lu le ${dateFr(d.luLe)}.</p>
        ${d.ecriturePossible ? '<p class="dr"><b>Jeton trop large.</b> Ce jeton permet aussi d\'écrire dans le dépôt. L\'outil ne le fait jamais, mais un jeton en lecture seule est plus sûr.</p>' : '<p class="ev">L\'outil ne fait que lire : il ne peut rien modifier dans votre dépôt.</p>'}
        ${l?.erreur ? `<p class="dr"><b>Mise à jour interrompue.</b> ${esc(l.erreur)}</p>` : ""}
        ${d.changements ? `<div class="tech"><span class="lb">Ce qui a changé depuis la lecture du ${dateFr(d.changements.depuis)}</span>${d.changements.lignes.length
          ? `<ul class="chg">${d.changements.lignes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
          : "<p>Rien n'a changé : la carte est la même qu'à la lecture précédente.</p>"}</div>` : ""}
        <div class="tech"><button class="cp" id="gh-maj">Mettre à jour</button><p class="ev" style="margin-top:8px">Relit le dépôt et résume ce qui a changé. Vos corrections à la main sont conservées.</p></div>`;
      else h += `<h2>Connecter votre dépôt</h2>${l?.erreur ? `<p class="dr"><b>Lecture interrompue.</b> ${esc(l.erreur)}</p>` : ""}
        ${projet.demo ? '<p>En mode démonstration, l\'outil lit un dépôt d\'exemple fourni avec lui.</p>' : `
        <p>L'outil lit votre dépôt pour vérifier, case par case, ce qui est réellement construit. Il ne peut rien y modifier.</p>
        <label>Dépôt<input id="gh-depot" placeholder="proprietaire/nom" value="${esc(d?.nom ?? "")}" autocomplete="off"></label>
        <label>Jeton en lecture seule<input id="gh-jeton" type="password" autocomplete="off"><small>Laissez vide pour un dépôt public.</small></label>
        <details class="ev"><summary>Comment créer ce jeton</summary><p style="margin-top:6px">Sur GitHub : Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token. Choisissez « Only select repositories » et votre dépôt, puis dans « Repository permissions » mettez <b>Contents</b> et <b>Pull requests</b> sur « Read-only ». Rien d'autre.</p></details>`}
        <div id="gh-msg"></div><button class="cp" id="gh-go">${projet.demo ? "Lire le dépôt d'exemple" : "Connecter et lire le dépôt"}</button>`;
    } else if (sel[0] === "f") {
      const fi = +sel.slice(1), f = F[fi], c = stat(toutes(f));
      h += `<span class="ey">Famille${f.responsable ? " · " + esc(f.responsable) : ""}</span><h2>${esc(f.titre)}</h2><p>${esc(f.description)}</p>
        ${f.responsable ? "" : '<p class="ev">Responsable non précisé dans la description.</p>'}
        <p class="ev">${c.done} débloquées, ${c.wip} en cours, ${c.todo} à débloquer.</p><ul>`;
      f.themes.forEach((t, gi) => t.cases.forEach((n, ni) => { if (n.etat === "wip" || n.etat === "todo") h += `<li><button data-go="s${fi}-${gi}-${ni}"><span class="tag ${n.etat}">${LABEL[n.etat]}</span><span>${esc(n.titre)}</span></button></li>`; }));
      h += "</ul>";
    } else {
      const [fi, gi, ni] = sel.slice(1).split("-").map(Number), f = F[fi], n = f.themes[gi].cases[ni];
      h += `<span class="ey">${esc(f.titre)} · ${esc(f.themes[gi].titre)}</span><h2>${esc(n.titre)}</h2><span class="row-tags"><span class="tag ${n.etat}">${LABEL[n.etat]}</span>${n.nonVerifie ? '<span class="tag todo">Non vérifié</span>' : ""}${n.corrige ? '<span class="tag later">Corrigé par vous</span>' : ""}</span>
        ${n.corrige?.etat ? `<p class="ev">Vous avez fixé cet état à la main. L'outil, lui, a lu dans le dépôt : « ${LABEL[n.etatLu]} ». Le texte ci-dessous est celui de l'outil.</p>` : ""}
        <div><span class="lb">À quoi ça sert</span><p>${esc(n.aQuoiCaSert)}</p></div>
        <div><span class="lb">Où on en est</span><p>${esc(n.ouOnEnEst)}</p></div>
        ${n.citation ? `<div><span class="lb">D'après votre description</span><blockquote>« ${esc(n.citation)} »</blockquote></div>` : ""}
        ${n.ecart ? `<div class="dr"><b>Écart avec votre description.</b> ${n.ecart.citation ? `Vous avez écrit : « ${esc(n.ecart.citation)} ». ` : ""}${esc(n.ecart.constat)}</div>` : ""}`;
      const qui = (ts) => `<ul class="who">${ts.map((t) => `<li><b>${esc(t.qui)}</b><span>${esc(t.quoi)}</span></li>`).join("")}</ul>`;
      if (n.etat === "done") {
        const livraisons = (n.preuves ?? []).filter((p) => p.type === "fusion" && p.etat === "fusionnee");
        if (n.commentCaMarche) h += `<div class="tech"><span class="lb">Comment ça marche</span><p>${esc(n.commentCaMarche)}</p></div>`;
        h += `<div class="tech"><span class="lb">Qui l'a fait</span>${livraisons.length
          ? `<ul class="who">${livraisons.map((p) => `<li><b>${esc(p.auteur)}</b><span>${esc(p.titre)} <i>n° ${p.numero} · fusionné le ${dateFr(p.date).slice(0, 5)}</i></span></li>`).join("")}</ul>`
          : `<p>${f.responsable ? `Famille portée par ${esc(f.responsable)}. ` : ""}Pas de livraison précise identifiée.</p>`}</div>
          ${n.corrige?.etat ? "" : `<p class="ev">« Débloqué » veut dire construit${n.teste ? " et testé" : ""}, pas encore éprouvé en production.</p>`}`;
      } else if (n.etat === "wip") {
        if (n.commentCaMarche) h += `<div class="tech"><span class="lb">Ce qui existe déjà</span><p>${esc(n.commentCaMarche)}</p></div>`;
        h += `<div class="tech"><span class="lb">Qui doit faire quoi</span>${n.taches?.length ? qui(n.taches) : '<p class="ev">Non vérifié : l\'outil n\'a pas su dire ce qu\'il reste à faire.</p>'}</div>`;
      } else if (n.etat === "todo") {
        if (n.horsCode) h += `<p class="ev">Ce n'est pas du code à écrire : c'est une démarche ou une décision.</p>`;
        if (n.decision) h += `<div class="tech"><span class="lb">Décision à prendre avant</span><p>${esc(n.decision)}</p></div>`;
        if (n.taches?.length) h += `<div class="tech"><span class="lb">Qui doit faire quoi${n.prompt ? " avant" : ""}</span>${qui(n.taches)}</div>`;
        if (n.prompt) h += `<div class="tech"><span class="lb">Prompt pour le réaliser, aligné sur le dépôt</span><pre id="pr">${esc(n.prompt)}</pre><button class="cp" id="cp">Copier le prompt</button><p class="ev" style="margin-top:8px">À coller dans votre propre outil de développement. Carte produit ne lance rien lui-même.</p></div>`;
        if (!n.nonVerifie && n.origine !== "depot") h += `<p class="ev">Proposition de l'outil, déduite de votre description.${projet.depot?.sha ? "" : " Elle sera vérifiée dans le dépôt quand il sera connecté."}</p>`;
      }
      if (n.origine === "depot") h += `<p class="ev">Trouvé dans le dépôt : cette case ne vient pas de votre description.</p>`;
      h += listePreuves(n);
      if (!projet.lecture?.enCours) h += `<details class="ev" id="cor"><summary>Corriger cette case</summary><div class="cor">
        <label>État<select id="cor-etat">${Object.keys(LABEL).map((e) => `<option value="${e}"${e === n.etat ? " selected" : ""}>${LABEL[e]}</option>`).join("")}</select></label>
        <label>Titre<input id="cor-titre" maxlength="60" value="${esc(n.titre)}"></label>
        <label>À quoi ça sert<textarea id="cor-sert" rows="3" maxlength="400">${esc(n.aQuoiCaSert)}</textarea></label>
        <div id="cor-msg"></div>
        <div class="row-tags"><button class="cp" id="cor-ok" data-id="${n.id}">Enregistrer ma correction</button>${n.corrige ? `<button class="cp ghost" id="cor-non" data-id="${n.id}">Annuler ma correction</button>` : ""}</div>
        <p>Votre correction est gardée quand vous mettez la carte à jour. La fiche continue d'afficher ce que l'outil a lu dans le dépôt.</p></div></details>`;
    }
    const fam = sel[0] === "f" || sel[0] === "s" ? COULEURS[parseInt(sel.slice(1)) % COULEURS.length] : null;
    el.style.setProperty("--fc", fam ? fam[0] : "#1b1f2a"); el.style.setProperty("--ft", fam ? fam[1] : "#f2f4f7");
    el.innerHTML = h; el.hidden = false;
    el.querySelector(".x").onclick = () => { sel = null; render(); };
    const cp = el.querySelector("#cp");
    if (cp) cp.onclick = () => {
      const pre = el.querySelector("#pr");
      const repli = () => { const r = document.createRange(); r.selectNodeContents(pre); const g = getSelection(); g.removeAllRanges(); g.addRange(r); cp.textContent = "Texte sélectionné : copiez-le"; };
      try { navigator.clipboard.writeText(pre.textContent).then(() => { cp.textContent = "Copié"; }, repli); } catch { repli(); }
    };
    const go = el.querySelector("#gh-go");
    if (go) go.onclick = async () => {
      go.disabled = true;
      try {
        projet = await api(`/projets/${projet.id}/depot`, { depot: el.querySelector("#gh-depot")?.value ?? "", jeton: el.querySelector("#gh-jeton")?.value ?? "" });
        suivre(); render();
      } catch (e) { go.disabled = false; el.querySelector("#gh-msg").innerHTML = `<p class="dr">${esc(e.message)}</p>`; }
    };
    const aff = el.querySelector("#aff-ok");
    if (aff) aff.onclick = async () => {
      const reponses = (projet.questions ?? []).map((_, i) => el.querySelector(`[data-q="${i}"]`)?.value ?? "");
      const msg = el.querySelector("#aff-msg");
      aff.disabled = true; msg.innerHTML = '<p class="wait">L\'arbre s\'ajuste… Cela prend environ une minute.</p>';
      try {
        projet = await api(`/projets/${projet.id}/ajuster`, { reponses, remarque: el.querySelector("#aff-rem").value });
        arbre = projet.arbre; F = arbre.familles; render();
        el.querySelector("#aff-msg").innerHTML = `<p class="ev">Arbre ajusté.${projet.depot?.sha ? " Pour vérifier les nouvelles cases dans le dépôt, cliquez sur « Mettre à jour »." : ""}</p>`;
      } catch (e) { aff.disabled = false; msg.innerHTML = `<p class="dr">${esc(e.message)}</p>`; }
    };
    const maj = el.querySelector("#gh-maj");
    if (maj) maj.onclick = mettreAJour;
    const corriger = (bouton, corps) => async () => {
      bouton.disabled = true;
      try { projet = await api(`/projets/${projet.id}/cases/${bouton.dataset.id}`, corps()); arbre = projet.arbre; F = arbre.familles; render(); }
      catch (e) { bouton.disabled = false; el.querySelector("#cor-msg").innerHTML = `<p class="dr">${esc(e.message)}</p>`; }
    };
    const ok = el.querySelector("#cor-ok"), non = el.querySelector("#cor-non");
    if (ok) ok.onclick = corriger(ok, () => ({ etat: el.querySelector("#cor-etat").value, titre: el.querySelector("#cor-titre").value, aQuoiCaSert: el.querySelector("#cor-sert").value }));
    if (non) non.onclick = corriger(non, () => ({ annuler: true }));
    el.querySelectorAll("[data-go]").forEach((x) => (x.onclick = () => { sel = x.dataset.go; render(); center(sel); }));
  }

  /* déplacement et zoom */
  let s = 1, tx = 0, ty = 0;
  const apply = () => { layer.style.transform = `translate(${tx}px,${ty}px) scale(${s})`; };
  function fit(whole) {
    const bw = board.clientWidth, bh = board.clientHeight;
    const fw = Math.min(bw / (W + 16), 1), fa = Math.min(fw, (bh - 130) / H);
    s = whole ? fa : Math.max(fw, 0.6);
    tx = Math.max((bw - W * s) / 2, 8); ty = racine.querySelector(".top").offsetHeight + 22 - TOP * s + 10; apply();
  }
  function zoomAt(f, cx, cy) { const ns = Math.min(2, Math.max(0.3, s * f)); tx = cx - (cx - tx) * ns / s; ty = cy - (cy - ty) * ns / s; s = ns; apply(); }
  function center(k) {
    const el = layer.querySelector(`[data-k="${k}"]`); if (!el) return;
    const x = el.offsetLeft + el.offsetWidth / 2, y = el.offsetTop + el.offsetHeight / 2;
    tx = board.clientWidth * 0.4 - x * s; ty = board.clientHeight * 0.45 - y * s; apply();
  }
  const pts = new Map(); let moved = 0, pinch = 0;
  board.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (pts.size === 2) { const v = [...pts.values()]; pinch = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); } });
  board.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { moved += Math.abs(dx) + Math.abs(dy); if (moved > 5) { board.classList.add("drag"); tx += dx; ty += dy; apply(); } }
    else if (pts.size === 2) { const v = [...pts.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); if (pinch) zoomAt(d / pinch, (v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2); pinch = d; moved = 99; }
  });
  const up = (e) => { pts.delete(e.pointerId); board.classList.remove("drag"); if (pts.size < 2) pinch = 0; };
  board.addEventListener("pointerup", up); board.addEventListener("pointercancel", up); board.addEventListener("pointerleave", up);
  board.addEventListener("wheel", (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); else { tx -= e.deltaX; ty -= e.deltaY; apply(); } }, { passive: false });
  layer.addEventListener("click", (e) => { const b = e.target.closest("button.nd"); if (!b || moved > 5) return; sel = sel === b.dataset.k ? null : b.dataset.k; render(); });
  $("#zi").onclick = () => zoomAt(1.2, board.clientWidth / 2, board.clientHeight / 2);
  $("#zo").onclick = () => zoomAt(1 / 1.2, board.clientWidth / 2, board.clientHeight / 2);
  $("#zf").onclick = () => fit(true);
  /* le bouton du dépôt, et le suivi d'une lecture en cours */
  function bouton() {
    const b = $("#gh"), l = projet.lecture;
    b.className = "tg depot" + (l?.enCours ? " lit" : projet.depot?.sha ? " ok" : "");
    b.innerHTML = l?.enCours ? `<i class="lg w"></i><span>${esc(l.message)}</span>` : projet.depot?.sha ? `<span>Dépôt ${esc(projet.depot.nom)}</span>` : `<span>Connecter GitHub</span>`;
    b.setAttribute("aria-pressed", sel === "depot");
    $("#maj").hidden = !projet.depot?.sha || !!l?.enCours;
    const reste = (projet.questions ?? []).filter((_, i) => !projet.reponses?.[i]?.trim()).length;
    $("#aff").innerHTML = `<span>Ajuster l'arbre</span>${reste ? `<i>${reste}</i>` : ""}`;
    $("#aff").hidden = !!l?.enCours; $("#aff").setAttribute("aria-pressed", sel === "affiner");
  }
  async function mettreAJour() {
    try { projet = await api(`/projets/${projet.id}/lecture`, {}); } catch (e) { projet.lecture = { enCours: false, message: "", erreur: e.message }; }
    ecartsOn = false; sel = "depot"; suivre(); render();
  }
  $("#maj").onclick = mettreAJour;
  $("#aff").onclick = () => { ecartsOn = false; sel = sel === "affiner" ? null : "affiner"; render(); };
  $("#gh").onclick = () => { ecartsOn = false; sel = sel === "depot" ? null : "depot"; render(); };
  $("#dt").onclick = () => { ecartsOn = !ecartsOn; sel = ecartsOn ? "ecarts" : null; render(); };
  let minuterie = 0;
  function suivre() {
    clearTimeout(minuterie);
    if (!projet.lecture?.enCours) return;
    minuterie = setTimeout(async () => {
      if (!racine.contains(board)) return; // on a quitté la carte
      try {
        const frais = await api(`/projets/${projet.id}`);
        const fini = !frais.lecture?.enCours;
        projet = frais; arbre = projet.arbre; F = arbre.familles;
        if (fini && sel === "depot" && !frais.lecture?.erreur && !frais.depot?.changements) sel = "root";
        render();
      } catch { /* on réessaie au tour suivant */ }
      suivre();
    }, 1500);
  }
  function render() { build(); card(); bouton(); }
  // À l'arrivée sur un arbre tout neuf, les questions sont ouvertes à côté.
  if (!projet.depot && (projet.questions ?? []).some((_, i) => !projet.reponses?.[i]?.trim())) sel = "affiner";
  suivre();
  render(); fit(false);
}
