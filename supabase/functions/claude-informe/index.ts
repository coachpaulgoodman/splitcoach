// SplitCoach · función "claude-informe" (Supabase Edge Function)
// Recibe la conversación desde la app, verifica que quien llama sea el coach y la envía a la API de Claude.
// La clave ANTHROPIC_API_KEY vive solo aquí (Secrets de Supabase), nunca en GitHub.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "sin_clave", detail: "Falta el secreto ANTHROPIC_API_KEY en Supabase" }, 500);

    // 1) solo el coach con sesión iniciada
    const auth = req.headers.get("Authorization") ?? "";
    const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, apikey, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!u?.user) return json({ error: "sin_sesion" }, 401);
    const { data: v, error: ve } = await sb.rpc("vincularme");
    if (ve || !v || v.rol !== "coach") return json({ error: "solo_coach" }, 403);

    // 2) conversación
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    if (!messages.length || messages.some((m: any) => !["user", "assistant"].includes(m?.role) || typeof m?.content !== "string"))
      return json({ error: "mensajes" }, 400);
    if (JSON.stringify(messages).length > 200_000) return json({ error: "muy_largo" }, 413);

    // 3) Claude
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5-5",
        max_tokens: 6000,
        system: "Eres el analista de rendimiento de SplitCoach, app de un entrenador de natación Master en Chile. Responde en español de Chile.",
        messages,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "api", detail: d?.error?.message || String(r.status) }, 502);
    const text = (d.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    return json({ text, usage: d.usage || null });
  } catch (e) {
    return json({ error: "interno", detail: String((e as Error)?.message || e) }, 500);
  }
});
