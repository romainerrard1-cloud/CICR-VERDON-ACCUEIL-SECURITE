import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { processDossier } from "../lib/mails.mts";

/* Tous les matins : envoie les questionnaires dus (1 mois, 3 mois) et réessaie les envois échoués. */
export default async () => {
  const st = getStore({ name: "cicr-sse", consistency: "strong" });
  const settings = (await st.get("config/settings", { type: "json" })) || {};
  const { blobs } = await st.list({ prefix: "dossiers/" });
  let sent = 0;
  for (const b of blobs) {
    const d = await st.get(b.key, { type: "json" }) as any;
    if (!d) continue;
    if (await processDossier(d, settings)) { await st.setJSON(b.key, d); sent++; }
  }
  console.log(`relances : ${sent} dossier(s) mis à jour`);
};

export const config: Config = { schedule: "0 6 * * *" };
