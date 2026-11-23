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

export function monterCarte(racine, projet, { modeDemo }) {
  const arbre = projet.arbre, F = arbre.familles;
  document.body.className = "";
  racine.innerHTML = `
    <div id="board" aria-label="Arbre du produit ${esc(arbre.produit.nom)}"><div id="layer"></div></div>
    <div class="top">
      <div class="hud">
        <a class="chip" href="#/" aria-label="Retour aux projets">←</a>
        <div class="chip"><h1>Carte produit ${esc(arbre.produit.nom)}</h1></div>
        <div class="chip k"><i class="lg"></i><b id="c1"></b> débloqués</div>
        <div class="chip k"><i class="lg w"></i><b id="c2"></b> en cours</div>
        <div class="chip k"><i class="lg t"></i><b id="c3"></b> à débloquer</div>
        ${projet.demo ? '<div class="chip demo">Exemple de démonstration</div>' : ""}
      </div>
    </div>
    <div class="zoom" role="group" aria-label="Zoom">
      <button id="zo" aria-label="Dézoomer">−</button><button id="zi" aria-label="Zoomer">+</button><button id="zf">Tout voir</button>
    </div>
    <div class="hint">Glissez pour vous déplacer · cliquez sur une case pour le détail</div>
    <aside class="card" id="card" hidden aria-live="polite"></aside>`;
  const $ = (s) => racine.querySelector(s);
  const board = $("#board"), layer = $("#layer");
  let W = 0, H = 0, sel = null;

  function build() {
    let html = "", lines = "";
    const g = stat(F.flatMap(toutes)), pct = Math.round(part(g.done, g.tot)), C = 2 * Math.PI * 46;
    let y = TOP, lastF = 0;
    const rcy = TOP + RS / 2;
    html += `<button class="nd root" data-k="root" style="left:${RX}px;top:${TOP}px"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="#e6e9ee" stroke-width="7"/><circle cx="50" cy="50" r="46" fill="none" stroke="#1b1f2a" stroke-width="7" stroke-linecap="round" stroke-dasharray="${part(g.done, g.tot) / 100 * C} ${C}"/></svg><em>${esc(arbre.produit.nom)}</em><b>${pct} %</b><span>${g.done} sur ${g.tot}</span></button>`;
    lines += `<path class="ln" d="M${RX + RS} ${rcy} H${TRUNK}"/>`;
    y = TOP + (RS - FH) / 2;
    F.forEach((f, fi) => {
      const c = stat(toutes(f)), fy = y, fcy = fy + FH / 2, [fc, ft] = COULEURS[fi % COULEURS.length], sty = `--fc:${fc};--ft:${ft}`;
      lines += `<g style="${sty}">` + (fi === 0 ? `<path class="ln" d="M${TRUNK} ${fcy} H${FX}"/>` : `<path class="ln" d="M${TRUNK} ${fcy - 12} Q${TRUNK} ${fcy} ${TRUNK + 12} ${fcy} H${FX}"/>`);
      html += `<button class="nd fam" data-k="f${fi}" aria-pressed="${sel === "f" + fi}" style="${sty};left:${FX}px;top:${fy}px;width:${FW}px;height:${FH}px">
        <span class="hex">${svg(EMBLEMES[f.embleme] ?? EMBLEMES.reglages)}</span><span class="tx"><b>${esc(f.titre)}</b><span class="xp"><span class="seg"><u style="width:${part(c.done, c.tot)}%"></u><u style="width:${part(c.wip, c.tot)}%"></u></span><i>${c.done}/${c.tot}</i></span></span></button>`;
      let gy = fy + (FH - SH) / 2, lastG = fcy;
      f.themes.forEach((t, gi) => {
        const steps = t.cases.map((n, i) => ({ ...n, i })).sort((a, z) => ORDER[a.etat] - ORDER[z.etat]);
        const gcy = gy + SH / 2, gs = stat(t.cases), gcl = gs.done ? "done" : "";
        lines += gi === 0 ? `<path class="ln ${gcl}" d="M${FX + FW} ${fcy} H${GX}"/>` : `<path class="ln ${gcl}" d="M${BUS} ${gcy - 12} Q${BUS} ${gcy} ${BUS + 12} ${gcy} H${GX}"/>`;
        lastG = gcy;
        html += `<span class="gp" style="${sty};left:${GX}px;top:${gcy - GH / 2}px;width:${GW}px;height:${GH}px">${esc(t.titre)}</span>`;
        steps.forEach((n, k) => {
          const r = Math.floor(k / PER), col = k % PER, x = STX + col * SX, sy = gy + r * ROWH, cy = sy + SH / 2;
          if (col === 0) {
            if (r === 0) lines += `<path class="ln ${n.etat}" d="M${GX + GW} ${gcy} H${x}"/>`;
            else { const ex = GX + GW + 14; lines += `<path class="ln ${n.etat}" d="M${ex} ${gcy} V${cy - 12} Q${ex} ${cy} ${ex + 12} ${cy} H${x}"/>`; }
          } else lines += `<path class="ln ${n.etat}" d="M${x - (SX - SW)} ${cy} H${x}"/>`;
          const key = `s${fi}-${gi}-${n.i}`;
          html += `<button class="nd st ${n.etat}" data-k="${key}" aria-pressed="${sel === key}" aria-label="${esc(n.titre)} : ${LABEL[n.etat]}" style="${sty};left:${x}px;top:${sy}px;width:${SW}px;height:${SH}px"><span class="hex">${I[n.etat]}</span><span>${esc(n.titre)}</span></button>`;
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
        <p class="ev">Carte établie le ${le} à partir de votre description seule. Aucun dépôt n'est connecté : aucune case n'est vérifiée, toutes sont des propositions de l'outil.</p>`;
    } else if (sel[0] === "f") {
      const fi = +sel.slice(1), f = F[fi], c = stat(toutes(f));
      h += `<span class="ey">Famille${f.responsable ? " · " + esc(f.responsable) : ""}</span><h2>${esc(f.titre)}</h2><p>${esc(f.description)}</p>
        ${f.responsable ? "" : '<p class="ev">Responsable non précisé dans la description.</p>'}
        <p class="ev">${c.done} débloquées, ${c.wip} en cours, ${c.todo} à débloquer.</p><ul>`;
      f.themes.forEach((t, gi) => t.cases.forEach((n, ni) => { if (n.etat === "wip" || n.etat === "todo") h += `<li><button data-go="s${fi}-${gi}-${ni}"><span class="tag ${n.etat}">${LABEL[n.etat]}</span><span>${esc(n.titre)}</span></button></li>`; }));
      h += "</ul>";
    } else {
      const [fi, gi, ni] = sel.slice(1).split("-").map(Number), f = F[fi], n = f.themes[gi].cases[ni];
      h += `<span class="ey">${esc(f.titre)} · ${esc(f.themes[gi].titre)}</span><h2>${esc(n.titre)}</h2><span class="tag ${n.etat}">${LABEL[n.etat]}</span>
        <div><span class="lb">À quoi ça sert</span><p>${esc(n.aQuoiCaSert)}</p></div>
        <div><span class="lb">Où on en est</span><p>${esc(n.ouOnEnEst)}</p></div>
        ${n.citation ? `<div><span class="lb">D'après votre description</span><blockquote>« ${esc(n.citation)} »</blockquote></div>` : ""}
        ${n.etat === "todo" ? '<p class="ev">Proposition de l\'outil, déduite de votre description. Elle sera vérifiée dans le dépôt quand il sera connecté.</p>' : ""}`;
    }
    const fam = sel[0] === "f" || sel[0] === "s" ? COULEURS[parseInt(sel.slice(1)) % COULEURS.length] : null;
    el.style.setProperty("--fc", fam ? fam[0] : "#1b1f2a"); el.style.setProperty("--ft", fam ? fam[1] : "#f2f4f7");
    el.innerHTML = h; el.hidden = false;
    el.querySelector(".x").onclick = () => { sel = null; render(); };
    el.querySelectorAll("[data-go]").forEach((x) => (x.onclick = () => { sel = x.dataset.go; render(); center(sel); }));
  }

  /* déplacement et zoom */
  let s = 1, tx = 0, ty = 0;
  const apply = () => { layer.style.transform = `translate(${tx}px,${ty}px) scale(${s})`; };
  function fit(whole) {
    const bw = board.clientWidth, bh = board.clientHeight;
    const fw = Math.min(bw / (W + 16), 1), fa = Math.min(fw, (bh - 130) / H);
    s = whole ? fa : Math.max(fw, 0.6);
    tx = Math.max((bw - W * s) / 2, 8); ty = 64 - TOP * s + 10; apply();
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
  function render() { build(); card(); }
  render(); fit(false);
}
