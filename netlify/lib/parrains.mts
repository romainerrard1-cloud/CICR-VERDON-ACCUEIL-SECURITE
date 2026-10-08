/* Parrains tuteurs CICR et règle de désignation automatique.
   Chantier client connu (Chanel, Sanofi, BASF Meaux) : le référent du site.
   Sinon, à l'atelier : selon la famille du poste (terrain, logistique, support). */

const CRIT = { crit_entreprise: true, crit_technique: true, crit_sse: true, crit_pedago: true };

export const PARRAINS_CICR = [
  { nom: "Brahim Bassine", role: "Responsable atelier", email: "BBassine@groupe-verdon.com", site: "atelier", famille: "terrain", pourquoi: "Responsable de l'atelier et du personnel atelier, il a le plus d'expérience dans nos métiers (soudage, tuyauterie, chaudronnerie). Présent tous les jours à l'atelier et toujours accessible, il montre les bons gestes et les modes opératoires, et veille au respect des consignes de sécurité et au port des EPI." },
  { nom: "Christophe Perrin", role: "Responsable logistique", email: "", site: "atelier", famille: "logistique", pourquoi: "Responsable logistique, il maîtrise le magasin, les flux, la manutention, le levage et la conduite d'engins. Il transmet les règles de circulation, d'arrimage et de conduite, qui sont les risques majeurs des postes logistiques, et organise le travail au quotidien." },
  { nom: "Laura Ducoin", role: "HR Business Partner", email: "LDucoin@groupe-verdon.com", site: "atelier", famille: "support", pourquoi: "HR Business Partner, elle connaît l'organisation de l'entreprise, ses interlocuteurs et ses règles. Elle accompagne l'intégration des fonctions support, répond aux questions sur les droits et démarches des salariés et intérimaires, et fait le lien avec la santé au travail." },
  { nom: "Fabien Pontus", role: "Directeur CICR", email: "", site: "atelier", famille: "support", pourquoi: "Directeur de CICR, il connaît l'entreprise, son organisation, ses clients et ses projets mieux que personne. Signataire de la politique SSE, il porte le niveau d'exigence de l'entreprise en sécurité et accompagne l'intégration de l'encadrement et des fonctions support." },
  { nom: "Romain Errard", role: "Responsable SSE", email: "rerrard@groupe-verdon.com", site: "atelier", famille: "support", pourquoi: "Responsable SSE, il connaît l'ensemble des risques, des règles et des consignes de l'entreprise, anime l'accueil sécurité et la démarche MASE. Il est le référent naturel des fonctions support pour toute question de santé, de sécurité et d'environnement." },
  { nom: "Yvonnick Boulen", role: "Conducteur de travaux Chanel", email: "", site: "Chanel", famille: "tous", pourquoi: "Conducteur de travaux sur le site Chanel, il connaît les règles du client, son plan de prévention, ses accès et ses exigences de sécurité. Présent sur le chantier, il organise le travail au quotidien et accueille les nouveaux arrivants sur place." },
  { nom: "Ruben Nogueira", role: "Site Supervisor adjoint Sanofi", email: "", site: "Sanofi", famille: "tous", pourquoi: "Site Supervisor adjoint sur le site Sanofi, il connaît les règles du site pharmaceutique, les permis de travail, les zones à accès réglementé et les exigences du client. Présent sur place, il encadre les équipes et accompagne les nouveaux arrivants." },
  { nom: "Christophe Leclerc", role: "Chef d'équipe BASF Meaux", email: "", site: "BASF Meaux", famille: "tous", pourquoi: "Chef d'équipe sur le site BASF de Meaux, il connaît les règles du site chimique, les permis de travail et les consignes du client. Il organise le travail de l'équipe au quotidien, sur place, et accompagne les nouveaux arrivants dans leurs premiers jours." },
].map((p) => ({ ...p, ...CRIT }));

const FAMILLE: Record<string, string> = { soudeur: "terrain", tuyauteur: "terrain", chaudronnier: "terrain", monteur: "terrain", encadrant: "terrain", qc: "terrain", autre: "terrain", logisticien: "logistique", dessinateur: "support", bureau: "support" };
const CLIENTS = ["Chanel", "Sanofi", "BASF Meaux"];

export function siteOf(d: any) {
  const l: string[] = d?.lieux || [];
  return l.includes("Chantier client") && CLIENTS.includes(d?.client) ? d.client : "atelier";
}
const famOf = (p: any) => p.famille || (p.poste && p.poste !== "tous" ? FAMILLE[p.poste] : "tous");

export function pickParrain(list: any[], d: any) {
  const site = siteOf(d), fam = FAMILLE[d?.poste] || "terrain";
  const L = (list || []).filter((p) => p && p.nom);
  if (site !== "atelier") { const c = L.find((p) => p.site === site); if (c) return c; }
  const ok = (p: any) => (p.site || "atelier") === site || p.site === "tous";
  return L.find((p) => ok(p) && p.poste === d?.poste) || L.find((p) => ok(p) && !p.poste && famOf(p) === fam) || L.find((p) => ok(p) && famOf(p) === "tous") || null;
}

/* Ajoute une fois les parrains CICR manquants à la liste enregistrée. */
export function mergeDefaults(list: any[]) {
  const out = [...(list || [])];
  for (const x of PARRAINS_CICR) {
    const i = out.findIndex((p) => String(p.nom || "").toLowerCase() === x.nom.toLowerCase());
    if (i < 0) out.push({ ...x });
    else {
      out[i] = { ...x, ...out[i], role: out[i].role || x.role, site: out[i].site || x.site, famille: out[i].famille || x.famille };
      if (/^Référent CICR sur le site BASF/.test(out[i].pourquoi || "")) out[i].pourquoi = x.pourquoi;
    }
  }
  return out;
}
