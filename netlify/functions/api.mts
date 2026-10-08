import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { mailFor, renderText, renderHtml, siteUrl, sendMail, processDossier, mailConfigured, STEPS } from "../lib/mails.mts";

/* API de l'espace SSE CICR Verdon.
   Public : POST /api/accueil (fin d'accueil), POST /api/q (questionnaires), POST /api/login.
   Privé (jeton) : état, dossiers, accueils reçus, parrains, réglages. */

const ANSWER_KEYS = ["accueil","consignes","parrain","epi","securite","danger","danger_detail","commentaire","c_securite","c_risques","c_epi","c_gestes","c_autonomie","c_qualite","c_ponctualite","c_hierarchie","c_equipe","c_vigilance","fin_parrainage","experience","recommande","signataire"];
const FORMS = ["q1m","p1m","q3m"];
const enc = new TextEncoder();

function store() {
  return getStore({ name: "cicr-sse", consistency: "strong" });
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function hmac(msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(Netlify.env.get("SSE_SECRET") || "cicr-dev-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Buffer.from(sig).toString("base64url");
}
async function makeToken() {
  const exp = String(Date.now() + 12 * 3600 * 1000);
  return exp + "." + (await hmac(exp));
}
async function isAuthed(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [exp, sig] = t.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return sig === (await hmac(exp));
}
const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
const safeId = (s: string) => /^[\w-]{1,120}$/.test(s);

async function listJSON(prefix: string) {
  const st = store();
  const { blobs } = await st.list({ prefix });
  const out = await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })));
  return out.filter(Boolean);
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const m = req.method;
  const st = store();

  try {
    /* ---------- public ---------- */
    if (p[0] === "login" && m === "POST") {
      const body = await req.json().catch(() => ({}));
      const pw = Netlify.env.get("SSE_PASSWORD");
      if (!pw || String(body.code || "").trim() !== pw) {
        await new Promise((r) => setTimeout(r, 700));
        return json({ error: "code" }, 401);
      }
      return json({ token: await makeToken() });
    }

    if (p[0] === "accueil" && m === "POST") {
      const fd = await req.formData();
      const raw = String(fd.get("payload") || "");
      if (!raw || raw.length > 20000) return json({ error: "payload" }, 400);
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(raw); } catch { return json({ error: "payload" }, 400); }
      const id = rid();
      const file = fd.get("attestation");
      let hasPdf = false;
      if (file && typeof file !== "string") {
        if (file.size > 4 * 1024 * 1024) return json({ error: "pdf trop lourd" }, 413);
        const buf = await file.arrayBuffer();
        if (new TextDecoder().decode(buf.slice(0, 5)) === "%PDF-") { await st.set("pdf/" + id, buf); hasPdf = true; }
      }
      await st.setJSON("recus/" + id, { id, created_at: new Date().toISOString(), payload, hasPdf });
      return json({ ok: true });
    }

    if (p[0] === "q" && m === "POST") {
      const body = await req.json().catch(() => ({}));
      const token = String(body.token || ""), form = String(body.form || "");
      if (!safeId(token) || !FORMS.includes(form)) return json({ error: "lien" }, 400);
      const ref = await st.get("tok/" + token, { type: "json" }) as { id: string; k: string } | null;
      if (!ref || ref.k !== form) return json({ error: "lien" }, 404);
      const d = await st.get("dossiers/" + ref.id, { type: "json" }) as any;
      if (!d) return json({ error: "dossier" }, 404);
      const answers: Record<string, string> = {};
      for (const k of ANSWER_KEYS) if (body.answers && body.answers[k] != null) answers[k] = String(body.answers[k]).slice(0, 2000);
      const now = new Date().toISOString();
      d.steps = d.steps || {};
      d.steps[form] = { ...(d.steps[form] || {}), doneAt: now, answers };
      const sig = String(body.signature || "");
      if (sig && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length < 400000) d.steps[form].signature = sig;
      if (form === "p1m" && !d.steps[form].signature) return json({ error: "signature" }, 400);
      if (form === "p1m" && /^Oui/.test(answers.fin_parrainage || "")) d.finParrainage = now;
      await st.setJSON("dossiers/" + d.id, d);
      return json({ ok: true });
    }

    /* ---------- privé ---------- */
    if (!(await isAuthed(req))) return json({ error: "auth" }, 401);

    if (p[0] === "state" && m === "GET") {
      const [dossiers, recus, parrains, settings] = await Promise.all([
        listJSON("dossiers/"), listJSON("recus/"),
        st.get("config/parrains", { type: "json" }), st.get("config/settings", { type: "json" }),
      ]);
      return json({ dossiers, recus, parrains: (parrains as any)?.list || [], settings: settings || {}, mailOk: mailConfigured() });
    }

    if (p[0] === "dossiers" && p[1] && safeId(p[1])) {
      const id = p[1];
      if (m === "PUT") {
        const d = await req.json();
        d.id = id;
        for (const k of FORMS) { const t = d.steps?.[k]?.token; if (t && safeId(t)) await st.setJSON("tok/" + t, { id, k }); }
        /* parrain changé : on renvoie les mails de désignation au nouveau parrain et à l'arrivant */
        const prev = await st.get("dossiers/" + id, { type: "json" }) as any;
        if (prev?.parrain?.email && d.parrain?.email && prev.parrain.email !== d.parrain.email) {
          for (const k of ["mailArrivant", "mailParrain"]) if (d.steps?.[k]) d.steps[k] = {};
        }
        const settings = (await st.get("config/settings", { type: "json" })) || {};
        await processDossier(d, settings);
        await st.setJSON("dossiers/" + id, d);
        return json({ ok: true, dossier: d });
      }
      if (m === "DELETE") {
        const d = await st.get("dossiers/" + id, { type: "json" }) as any;
        if (d) {
          for (const k of FORMS) { const t = d.steps?.[k]?.token; if (t) await st.delete("tok/" + t); }
          if (d.recuId) await st.delete("pdf/" + d.recuId);
        }
        await st.delete("dossiers/" + id);
        return json({ ok: true });
      }
    }

    if (p[0] === "mail" && p[1] && safeId(p[1]) && STEPS.some((x) => x.k === p[2])) {
      const d = await st.get("dossiers/" + p[1], { type: "json" }) as any;
      if (!d) return json({ error: "dossier" }, 404);
      const settings = (await st.get("config/settings", { type: "json" })) || {};
      const m = mailFor(d, p[2], settings);
      if (!m) return json({ error: "mail" }, 404);
      if ((p[2] === "mailParrain" || p[2] === "p1m") && !d.parrain?.nom) return json({ error: "parrain" }, 409);
      if (req.method === "GET") return json({ to: m.to || "", subject: m.subject, text: renderText(m), html: renderHtml(m, siteUrl(settings) || new URL(req.url).origin), mailOk: mailConfigured() });
      if (req.method === "POST") {
        d.steps = d.steps || {}; const s = d.steps[p[2]] || (d.steps[p[2]] = {});
        try { await sendMail(m); s.sentAt = new Date().toISOString(); delete s.error; delete s.tries; }
        catch (e) { s.error = String((e as Error).message || e); await st.setJSON("dossiers/" + d.id, d); return json({ error: s.error, dossier: d }, 502); }
        await st.setJSON("dossiers/" + d.id, d);
        return json({ ok: true, dossier: d });
      }
    }

    if (p[0] === "recus" && p[1] && safeId(p[1])) {
      if (p[2] === "pdf" && m === "GET") {
        const buf = await st.get("pdf/" + p[1], { type: "arrayBuffer" });
        if (!buf) return json({ error: "pdf" }, 404);
        return new Response(buf, { headers: { "content-type": "application/pdf", "cache-control": "no-store" } });
      }
      if (m === "DELETE") {
        await st.delete("recus/" + p[1]);
        if (url.searchParams.get("pdf") === "1") await st.delete("pdf/" + p[1]);
        return json({ ok: true });
      }
    }

    if (p[0] === "config" && (p[1] === "parrains" || p[1] === "settings") && m === "PUT") {
      const body = await req.json();
      await st.setJSON("config/" + p[1], body);
      return json({ ok: true });
    }

    return json({ error: "introuvable" }, 404);
  } catch (e) {
    return json({ error: "serveur", detail: String(e) }, 500);
  }
};

export const config: Config = { path: "/api/*" };
