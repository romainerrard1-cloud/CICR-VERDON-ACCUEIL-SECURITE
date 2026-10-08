/* Mails automatiques du suivi des arrivants (envoi par Brevo).
   Utilisé par l'API (dès qu'un parrain est désigné) et par la relance quotidienne (1 mois, 3 mois). */

export type Step = { k: string; l: string; d: number; to: "arrivant" | "parrain"; form?: boolean };
export const STEPS: Step[] = [
  { k: "mailArrivant", l: "Mail de bienvenue à l'arrivant", d: 0, to: "arrivant" },
  { k: "mailParrain", l: "Mail au parrain tuteur", d: 0, to: "parrain" },
  { k: "q1m", l: "Questionnaire arrivant à 1 mois", d: 30, to: "arrivant", form: true },
  { k: "p1m", l: "Évaluation par le parrain à 1 mois", d: 30, to: "parrain", form: true },
  { k: "q3m", l: "Expérience à 3 mois (étoiles + avis Google)", d: 90, to: "arrivant", form: true },
];

const PHONE = "06 72 01 26 07";
const SSE_MAIL = "rerrard@groupe-verdon.com";

export function mailConfigured() {
  return !!Netlify.env.get("BREVO_API_KEY");
}
function sender() {
  return { email: Netlify.env.get("MAIL_FROM") || SSE_MAIL, name: Netlify.env.get("MAIL_FROM_NAME") || "Romain Errard - CICR Verdon" };
}
export function siteUrl(settings: any) {
  return String(settings?.site || Netlify.env.get("URL") || "").replace(/\/$/, "");
}

const fullName = (d: any) => `${d.prenom || ""} ${(d.nom || "").toUpperCase()}`.trim();
const first = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";
const fmt = (iso: string) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "à préciser");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function qLink(d: any, k: string, settings: any) {
  const s = d.steps?.[k] || {};
  const p = new URLSearchParams({ f: k, t: s.token || "", a: k === "p1m" ? fullName(d) : d.prenom || "" });
  if (k === "q1m" && d.parrain?.nom) p.set("p", d.parrain.nom);
  return `${siteUrl(settings)}/q.html?${p}`;
}

type Block = string | { list: string[] } | { button: [string, string] };
type Mail = { to: string; toName: string; subject: string; blocks: Block[] };

export function mailFor(d: any, k: string, settings: any): Mail | null {
  const pa = d.parrain || {};
  const lieu = [...(d.lieux || []), d.chantier].filter(Boolean).join(", ") || "à préciser";
  const sign = `${settings?.signataire || "Romain Errard"}\n${settings?.fonction || "SSE Manager"} - CICR Verdon\n${PHONE} - ${SSE_MAIL}`;
  const contacts = { list: [
    `Sécurité, santé, environnement : Romain Errard, SSE Manager - ${PHONE} - ${SSE_MAIL}`,
    "Votre arrivée : accueil CICR - 03 44 75 73 00",
    "RH : Laura Ducoin, HR Business Partner - 06 01 06 31 50 - LDucoin@groupe-verdon.com",
  ] };
  const risques: string[] = d.risques || [];
  const statut = String(d.statut || "").toLowerCase();
  const nouveau = /int[ée]rim/.test(statut) ? "un nouvel intérimaire" : "un nouvel arrivant";

  if (k === "mailArrivant") return { to: d.emailPerso, toName: fullName(d), subject: "Bienvenue chez CICR Verdon : votre parrain tuteur", blocks: [
    `Bonjour ${d.prenom},`,
    "Bienvenue chez CICR Verdon ! Votre accueil sécurité a bien été validé.",
    `Votre parrain tuteur sera ${pa.nom}. N'hésitez pas à aller vers lui ou elle en cas de besoin et pour vous accompagner dans vos premières semaines.`,
    ...(pa.pourquoi ? [`${first(pa.nom)} a été désigné(e) parrain tuteur pour ses compétences : ${pa.pourquoi}.`] : []),
    `Votre arrivée : le ${fmt(d.date)}, ${lieu}. Présentez-vous à 7h30 avec vos EPI.`,
    "La partie pratique de votre accueil renforcé se fera sur le terrain, avec votre chef d'équipe.",
    "En cas de question :", contacts,
    "Dans un mois, vous recevrez un court questionnaire pour noter votre accueil et votre parrain tuteur.",
    "Bonne mission,", sign,
  ] };

  if (k === "mailParrain") return { to: pa.email, toName: pa.nom, subject: `Attention : ${nouveau} arrive, vous êtes son parrain tuteur`, blocks: [
    `Bonjour ${first(pa.nom)},`,
    `Attention, ${nouveau} arrive : ${fullName(d)}, ${d.posteLabel || ""}${d.agence ? ` (agence ${d.agence})` : ""}, le ${fmt(d.date)}, ${lieu}.`,
    "Vous êtes désigné(e) comme son parrain tuteur. Merci d'être son référent sur les points suivants :",
    { list: [
      "l'accueillir et le présenter à l'équipe ;",
      "lui montrer son poste, les modes opératoires et les bons gestes ;",
      ...(risques.length ? [`les 3 risques majeurs de son poste : ${risques.join(", ")} ;`] : []),
      "vérifier le port des EPI et la bonne compréhension des consignes de sécurité ;",
      `l'accompagner, avec le chef d'équipe, dans la partie pratique de l'accueil renforcé${d.rq != null ? ` (note de la partie théorique : ${d.rq}/10)` : ""} ;`,
      "rester disponible pour toutes ses questions.",
    ] },
    `Dans un mois, un petit questionnaire vous sera envoyé afin d'évaluer ${fullName(d)}.`,
    "Merci pour votre engagement,", sign,
  ] };

  if (k === "q1m") return { to: d.emailPerso, toName: fullName(d), subject: "Votre premier mois chez CICR Verdon : notez votre accueil", blocks: [
    `Bonjour ${d.prenom},`,
    "Cela fait un mois que vous nous avez rejoints. Notez en 2 minutes votre accueil, la sécurité et votre parrain tuteur : votre avis nous aide à nous améliorer.",
    { button: ["Répondre au questionnaire", qLink(d, "q1m", settings)] },
    "Merci !", sign,
  ] };

  if (k === "p1m") return { to: pa.email, toName: pa.nom, subject: `Évaluation à 1 mois de ${fullName(d)}`, blocks: [
    `Bonjour ${first(pa.nom)},`,
    `Cela fait un mois que vous accompagnez ${fullName(d)}. Merci de noter ses premières semaines (sécurité, risques majeurs, EPI, gestes du métier, autonomie…) et de nous dire si la période d'accompagnement peut se terminer.`,
    { button: ["Évaluer en 2 minutes", qLink(d, "p1m", settings)] },
    "Merci !", sign,
  ] };

  if (k === "q3m") return { to: d.emailPerso, toName: fullName(d), subject: "Votre expérience chez Verdon", blocks: [
    `Bonjour ${d.prenom},`,
    "Cela fait trois mois que vous travaillez avec nous. Comment s'est passée votre expérience chez Verdon ?",
    { button: ["Donner mon avis", qLink(d, "q3m", settings)] },
    "Merci pour votre confiance,", sign,
  ] };
  return null;
}

export function renderText(m: Mail) {
  return m.blocks.map((b) => typeof b === "string" ? b : "list" in b ? b.list.map((x) => "- " + x).join("\n") : `${b.button[0]} :\n${b.button[1]}`).join("\n\n");
}
/* Mise en forme compatible Outlook (tableaux, styles en ligne, pas de dégradé). */
export function renderHtml(m: Mail, site = "") {
  const F = "font-family:Arial,Helvetica,sans-serif;";
  const band = ["#e4003a", "#f07d00", "#f2c200", "#3aaa35", "#0071b9", "#6c2c8c"].map((c) => `<td bgcolor="${c}" style="background:${c};height:6px;line-height:6px;font-size:0">&nbsp;</td>`).join("");
  const body = m.blocks.map((b) => {
    if (typeof b === "string") return `<p style="${F}margin:0 0 14px;font-size:15px;line-height:22px;color:#1b2127">${esc(b).replace(/\n/g, "<br>")}</p>`;
    if ("list" in b) return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px">${b.list.map((x) => `<tr><td valign="top" style="${F}color:#c8102e;font-size:15px;line-height:22px;padding:0 8px 4px 0">&#9632;</td><td style="${F}font-size:15px;line-height:22px;color:#1b2127;padding:0 0 4px">${esc(x)}</td></tr>`).join("")}</table>`;
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px"><tr><td bgcolor="#2c3c9c" style="background:#2c3c9c;border-radius:6px;padding:12px 22px"><a href="${esc(b.button[1])}" style="${F}color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px">${esc(b.button[0])} &rarr;</a></td></tr></table><p style="${F}margin:0 0 14px;font-size:12px;color:#56626d">Si le bouton ne fonctionne pas : <a href="${esc(b.button[1])}" style="color:#2c3c9c">${esc(b.button[1])}</a></p>`;
  }).join("");
  const logo = site ? `<img src="${esc(site)}/img/logo.png" width="110" alt="Verdon" style="display:block;border:0;width:110px;height:auto">` : `<b style="${F}font-size:18px;color:#1b2127">VERDON</b>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;border:1px solid #d3d9df;border-collapse:collapse">
<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${band}</tr></table></td></tr>
<tr><td style="padding:18px 24px 6px">${logo}<p style="${F}margin:10px 0 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#56626d;font-weight:bold">CICR Verdon &middot; accueil et suivi des arrivants</p></td></tr>
<tr><td style="padding:14px 24px 10px">${body}</td></tr>
</table>`;
}

export async function sendMail(m: Mail) {
  const key = Netlify.env.get("BREVO_API_KEY");
  if (!key) throw new Error("Envoi automatique non configuré");
  if (!m.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.to)) throw new Error("Adresse mail manquante ou invalide");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: sender(), replyTo: { email: SSE_MAIL, name: "Romain Errard" }, to: [{ email: m.to, name: m.toName || m.to }], subject: m.subject, htmlContent: renderHtml(m, Netlify.env.get("URL") || ""), textContent: renderText(m) }),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 200)}`);
}

function addDays(iso: string, n: number) {
  const d = new Date((iso || new Date().toISOString().slice(0, 10)) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const todayParis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

/* Envoie ce qui est dû pour un dossier. Retourne true si le dossier a changé. */
export async function processDossier(d: any, settings: any) {
  if (!mailConfigured() || d.archived || d.autoMail === false) return false;
  const today = todayParis();
  let changed = false;
  d.steps = d.steps || {};
  for (const st of STEPS) {
    const s = d.steps[st.k] || (d.steps[st.k] = {});
    if (s.sentAt || (st.form && s.doneAt)) continue;
    if (st.to === "parrain" && !d.parrain?.email) continue;
    if (st.d > 0 && addDays(d.date, st.d) > today) continue; /* bienvenue + parrain : dès la désignation */
    if (s.error && s.tries >= 3) continue;
    const m = mailFor(d, st.k, settings);
    if (!m) continue;
    try {
      await sendMail(m);
      s.sentAt = new Date().toISOString(); s.auto = true; delete s.error; delete s.tries;
    } catch (e) {
      s.error = String((e as Error).message || e); s.tries = (s.tries || 0) + 1;
    }
    changed = true;
  }
  return changed;
}
