/* SplitCoach · capa de datos sobre Supabase
   Ofrece a la app la misma interfaz que usaba en claude.ai (window.claude.use),
   más el inicio de sesión por correo, el vínculo coach/nadador y el respaldo de datos. */
(function () {
  "use strict";
  const cfg = window.SPLITCOACH_CONFIG || {};
  const configured = /^https:\/\//.test(cfg.url || "") && (cfg.anonKey || "").length > 30;
  window.SC_BLOB = configured ? cfg.url.replace(/\/$/, "") + "/storage/v1/object/public/media/" : "";

  let sb = null, session = null, rol = null, nadadorId = null;
  let resolveReady; const ready = new Promise(r => (resolveReady = r));

  /* ---------------- interfaz de inicio de sesión ---------------- */
  const css = `
  .sc-gate{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:24px max(16px,env(safe-area-inset-left,0px));background:var(--bg,#EEF4F5);overflow:auto}
  .sc-box{width:min(420px,100%);background:var(--surface,#fff);border:1px solid var(--line,#D3E1E4);border-radius:16px;padding:24px;display:grid;gap:14px;box-shadow:var(--shadow,0 10px 28px -12px rgba(11,42,74,.18))}
  .sc-box img{width:96px;height:96px;justify-self:center;border-radius:20px;background:#fff;padding:4px}
  .sc-box h1{margin:0;text-align:center;font-family:var(--f-brand,sans-serif);font-size:24px;color:var(--brand,#0B2A4A)}
  .sc-box p{margin:0;color:var(--muted,#557079);font-size:14px;text-align:center}
  .sc-box input{font:inherit;font-size:16px;padding:11px 12px;border-radius:10px;border:1px solid var(--line,#D3E1E4);background:var(--surface,#fff);color:var(--ink,#0E2A33);width:100%}
  .sc-box .code{letter-spacing:.3em;text-align:center;font-family:var(--f-mono,monospace)}
  .sc-box button{font:inherit;font-weight:600;padding:11px 14px;border-radius:10px;border:0;background:var(--accent,#0A6E8A);color:var(--accent-ink,#fff);cursor:pointer}
  .sc-box button.ghost{background:transparent;color:var(--accent,#0A6E8A);border:1px solid var(--line,#D3E1E4)}
  .sc-box button:disabled{opacity:.5}
  .sc-box .m{font-size:13.5px;text-align:center;min-height:1.2em}
  .sc-box .m.err{color:var(--bad,#C0392B)} .sc-box .m.ok{color:var(--good,#1F8A5B)}
  .sc-acct{margin-left:8px;font:inherit;font-size:12px;font-weight:600;padding:6px 10px;border-radius:99px;border:1px solid var(--line,#D3E1E4);background:var(--surface,#fff);color:var(--accent,#0A6E8A);cursor:pointer;white-space:nowrap}
  .sc-list{display:grid;gap:8px}
  .tag+.sc-acct{margin-left:8px}
  @media (max-width:430px){.tag{display:none}.sc-acct,.tag+.sc-acct{margin-left:auto}}
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  let gate = null;
  function showGate(html, bind) {
    if (!gate) { gate = document.createElement("div"); gate.className = "sc-gate"; document.body.appendChild(gate); }
    gate.innerHTML = `<div class="sc-box"><img src="logo.png" alt="SplitCoach"><h1>SplitCoach</h1>${html}</div>`;
    bind && bind(gate);
  }
  function hideGate() { if (gate) { gate.remove(); gate = null; } }
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function loginScreen(msg) {
    let email = "";
    try { email = localStorage.getItem("sc-email") || ""; } catch (_) {}
    showGate(`<p>Ingresa con tu correo. Te enviaremos un enlace para entrar.</p>
      <input id="sc-email" type="email" autocomplete="email" inputmode="email" placeholder="tu@correo.cl" value="${esc(email)}">
      <button id="sc-send">Enviar enlace</button><div class="m ${msg ? "err" : ""}" id="sc-m">${esc(msg || "")}</div>`, g => {
      const go = async () => {
        const e = g.querySelector("#sc-email").value.trim().toLowerCase(), m = g.querySelector("#sc-m"), b = g.querySelector("#sc-send");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { m.className = "m err"; m.textContent = "Revisa el correo."; return; }
        b.disabled = true; m.className = "m"; m.textContent = "Enviando…";
        try { localStorage.setItem("sc-email", e); } catch (_) {}
        const { error } = await sb.auth.signInWithOtp({ email: e, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
        if (error) { b.disabled = false; m.className = "m err"; m.textContent = /rate|limit/i.test(error.message) ? "Se enviaron demasiados correos. Espera unos minutos e intenta de nuevo." : "No se pudo enviar: " + error.message; return; }
        codeScreen(e);
      };
      g.querySelector("#sc-send").onclick = go;
      g.querySelector("#sc-email").onkeydown = ev => { if (ev.key === "Enter") go(); };
    });
  }
  function codeScreen(email) {
    showGate(`<p>Te enviamos un correo a <b>${esc(email)}</b> (asunto "Your sign-in link").</p>
      <p><b>Ábrelo en este mismo dispositivo</b> y pulsa "Sign in": entrarás directo a SplitCoach. Si no llega en un par de minutos, revisa spam.</p>
      <button class="ghost" id="sc-again">Reenviar correo</button><button class="ghost" id="sc-back">Usar otro correo</button><div class="m" id="sc-m"></div>`, g => {
      g.querySelector("#sc-back").onclick = () => loginScreen();
      g.querySelector("#sc-again").onclick = async ev => {
        const m = g.querySelector("#sc-m"); ev.target.disabled = true; m.className = "m"; m.textContent = "Enviando…";
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
        m.className = error ? "m err" : "m ok";
        m.textContent = error ? (/rate|limit|seconds/i.test(error.message) ? "Espera un minuto antes de pedir otro correo." : "No se pudo enviar: " + error.message) : "Correo reenviado.";
        setTimeout(() => { ev.target.disabled = false; }, 60000);
      };
    });
  }
  function notRegistered() {
    showGate(`<p>El correo <b>${esc(session.user.email)}</b> todavía no está registrado en SplitCoach.</p>
      <p>Pídele a tu entrenador que lo agregue a tu ficha y vuelve a entrar.</p>
      <button id="sc-retry">Ya me agregó, reintentar</button><button class="ghost" id="sc-out">Usar otro correo</button>`, g => {
      g.querySelector("#sc-retry").onclick = () => afterLogin(session);
      g.querySelector("#sc-out").onclick = async () => { await sb.auth.signOut(); loginScreen(); };
    });
  }

  async function afterLogin(s) {
    session = s;
    const { data, error } = await sb.rpc("vincularme");
    if (error) { showGate(`<p>No se pudo conectar con la base de datos: ${esc(error.message)}</p><button id="sc-r">Reintentar</button>`, g => g.querySelector("#sc-r").onclick = () => afterLogin(session)); return; }
    if (!data || !data.rol) { notRegistered(); return; }
    rol = data.rol; nadadorId = data.nadador_id || null;
    hideGate(); addAccountButton(); startRealtime();
    resolveReady(true);
  }

  /* ---------------- cuenta, respaldo e importación ---------------- */
  function addAccountButton() {
    const tag = document.getElementById("tag"); if (!tag || document.querySelector(".sc-acct")) return;
    const b = document.createElement("button"); b.className = "sc-acct"; b.type = "button"; b.textContent = "Cuenta";
    b.onclick = accountPanel; tag.insertAdjacentElement("afterend", b);
  }
  function accountPanel() {
    showGate(`<p>${esc(session.user.email)}<br>${rol === "coach" ? "Entrenador" : "Nadador"}</p><div class="sc-list">
      ${rol === "coach" ? `<button id="sc-bk">Descargar respaldo de datos</button><button class="ghost" id="sc-im">Importar respaldo</button><input id="sc-file" type="file" accept=".json,application/json" hidden>` : ""}
      <button class="ghost" id="sc-out">Cerrar sesión</button><button class="ghost" id="sc-close">Volver</button></div><div class="m" id="sc-m"></div>`, g => {
      const m = g.querySelector("#sc-m");
      g.querySelector("#sc-close").onclick = hideGate;
      g.querySelector("#sc-out").onclick = async () => { await sb.auth.signOut(); location.reload(); };
      if (rol !== "coach") return;
      g.querySelector("#sc-bk").onclick = async e => {
        e.target.disabled = true; m.className = "m"; m.textContent = "Preparando respaldo…";
        try {
          const all = []; for (let from = 0; ; from += 500) {
            const { data, error } = await sb.from("docs").select("col,id,data").order("col").order("id").range(from, from + 499);
            if (error) throw error; all.push(...data); if (data.length < 500) break; }
          const blob = new Blob([JSON.stringify({ app: "splitcoach", formato: 1, exportado: new Date().toISOString(), docs: all })], { type: "application/json" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "splitcoach-respaldo-" + new Date().toISOString().slice(0, 10) + ".json";
          document.body.appendChild(a); a.click(); a.remove(); m.className = "m ok"; m.textContent = "Respaldo descargado (" + all.length + " registros).";
        } catch (err) { m.className = "m err"; m.textContent = "No se pudo: " + (err.message || err); }
        e.target.disabled = false;
      };
      const f = g.querySelector("#sc-file");
      g.querySelector("#sc-im").onclick = () => f.click();
      f.onchange = async () => {
        const file = f.files[0]; if (!file) return;
        try {
          const j = JSON.parse(await file.text());
          if (j.app !== "splitcoach" || !Array.isArray(j.docs)) throw new Error("El archivo no es un respaldo de SplitCoach.");
          const docs = j.docs.filter(d => d && d.col && d.id && d.data);
          let done = 0, batch = [], size = 0;
          const flush = async () => { if (!batch.length) return; const { error } = await sb.from("docs").upsert(batch); if (error) throw error; done += batch.length; batch = []; size = 0; m.className = "m"; m.textContent = `Importando… ${done} de ${docs.length}`; };
          for (const d of docs) { const s = JSON.stringify(d.data).length; if (size + s > 900000) await flush(); batch.push({ col: d.col, id: d.id, data: d.data }); size += s; }
          await flush();
          m.className = "m ok"; m.textContent = `Listo: ${done} registros importados. Recargando…`;
          setTimeout(() => location.reload(), 1200);
        } catch (err) { m.className = "m err"; m.textContent = "No se pudo importar: " + (err.message || err); }
      };
    });
  }

  /* ---------------- base de datos (misma interfaz que la app ya usa) ---------------- */
  const listeners = new Set();
  const mkErr = e => ({ code: e && e.code ? String(e.code) : "unavailable", message: (e && e.message) || String(e) });
  const docSnap = (id, data) => ({ id, exists: data != null, data: () => (data == null ? undefined : JSON.parse(JSON.stringify(data))) });
  async function fetchCol(col) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("docs").select("id,data").eq("col", col).range(from, from + 999);
      if (error) throw error; out.push(...data); if (data.length < 1000) break;
    }
    return out;
  }
  async function fetchDoc(col, id) {
    const { data, error } = await sb.from("docs").select("data").eq("col", col).eq("id", id).maybeSingle();
    if (error) throw error; return data ? data.data : null;
  }
  async function deliver(L) {
    try {
      if (L.id != null) { L.next(docSnap(L.id, await fetchDoc(L.col, L.id))); return; }
      let rows = await fetchCol(L.col);
      if (L.order) rows.sort((a, b) => { const x = a.data[L.order], y = b.data[L.order]; return x === y ? 0 : x == null ? -1 : y == null ? 1 : x < y ? -1 : 1; });
      if (L.dir === "desc") rows.reverse();
      L.next({ docs: rows.map(r => docSnap(r.id, r.data)), size: rows.length, empty: !rows.length, docChanges: () => [] });
    } catch (e) { L.err && L.err(mkErr(e)); }
  }
  const pend = new Map();
  function changed(col) {
    clearTimeout(pend.get(col));
    pend.set(col, setTimeout(() => { pend.delete(col); listeners.forEach(L => { if (L.col === col) deliver(L); }); }, 120));
  }
  function startRealtime() {
    sb.channel("docs-cambios").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
      const r = (p.new && p.new.col) ? p.new : p.old; if (r && r.col) changed(r.col);
    }).subscribe();
  }
  const split = path => { const i = path.lastIndexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; };
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  function docRef(col, id) {
    return {
      id,
      onSnapshot(next, err) { const L = { col, id, next, err }; listeners.add(L); deliver(L); return () => listeners.delete(L); },
      async get() { try { return docSnap(id, await fetchDoc(col, id)); } catch (e) { throw mkErr(e); } },
      async set(data) { const { error } = await sb.from("docs").upsert({ col, id, data }); if (error) throw mkErr(error); changed(col); },
      async update(patch) { const { error } = await sb.rpc("doc_merge", { p_col: col, p_id: id, p_patch: patch }); if (error) throw mkErr(/not_found/.test(error.message) ? { code: "not-found", message: "No existe" } : error); changed(col); },
      async delete() { const { error } = await sb.from("docs").delete().eq("col", col).eq("id", id); if (error) throw mkErr(error); changed(col); },
      collection(sub) { return colRef(col + "/" + id + "/" + sub); }
    };
  }
  function colRef(col, order, dir) {
    const self = {
      onSnapshot(next, err) { const L = { col, id: null, next, err, order, dir }; listeners.add(L); deliver(L); return () => listeners.delete(L); },
      orderBy(f, d) { return colRef(col, f, d); },
      where() { return self; }, limit() { return self; },
      async get() { const rows = await fetchCol(col).catch(e => { throw mkErr(e); }); return { docs: rows.map(r => docSnap(r.id, r.data)), size: rows.length, empty: !rows.length }; },
      doc(id) { return docRef(col, id || rid()); },
      async add(data) { const id = rid(); await docRef(col, id).set(data); return docRef(col, id); }
    };
    return self;
  }
  const db = { collection: p => colRef(p), doc: p => { const [c, i] = split(p); return docRef(c, i); } };

  const user = {
    isOwner: async () => rol === "coach", canEdit: async () => rol === "coach", can: async () => true,
    id: async () => session ? session.user.id : null,
    me: async () => ({ id: session ? session.user.id : null, name: "", email: session ? session.user.email : null }),
    name: async () => "", email: async () => session ? session.user.email : null,
    profiles: async ids => Object.fromEntries((ids || []).map(i => [i, { id: i, name: "" }])),
    search: async () => []
  };
  const assets = {
    async upload(file, opts) {
      const type = (opts && opts.type) || file.type || "application/octet-stream";
      const ext = (/\.(\w{2,5})$/.exec(file.name || "") || [, type.split("/")[1] || "bin"])[1].toLowerCase();
      const name = (crypto.randomUUID ? crypto.randomUUID() : rid()) + "." + ext;
      if (file.size > 50 * 1024 * 1024) throw { code: "too_large", message: "Máximo 50 MB" };
      const { error } = await sb.storage.from("media").upload(name, file, { contentType: type, upsert: false });
      if (error) throw { code: /size|large/i.test(error.message) ? "too_large" : "unavailable", message: error.message };
      return { id: name, url: window.SC_BLOB + name, sizeBytes: file.size, contentType: type };
    },
    async delete(id) { await sb.storage.from("media").remove([id]); }
  };

  /* IA: conversa con Claude a través de la función "claude-informe" (la clave vive en Supabase) */
  const ia = {
    async chat(messages) {
      const { data, error } = await sb.functions.invoke("claude-informe", { body: { messages } });
      if (error) {
        let code = "no_ia", msg = error.message || String(error);
        try { const c = await error.context.json(); code = c.error || code; msg = c.detail || c.error || msg; } catch (_) {}
        if (error.context && error.context.status === 404) code = "no_ia";
        throw { code, message: msg };
      }
      return (data && data.text) || "";
    }
  };

  window.claude = {
    use: async name => {
      await ready;
      if (name === "db") return db;
      if (name === "user") return user;
      if (name === "assets") return rol === "coach" ? assets : null;
      if (name === "ia") return rol === "coach" ? ia : null;
      return null; // sin funciones de IA en esta versión
    }
  };

  /* ---------------- arranque ---------------- */
  function boot() {
    if (!configured) {
      showGate(`<p>Falta configurar la conexión: completa <b>config.js</b> con la Project URL y la anon key de Supabase.</p>`);
      return;
    }
    if (!window.supabase || !window.supabase.createClient) { showGate(`<p>No se pudo cargar Supabase. Revisa tu conexión y recarga.</p>`); return; }
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    let started = false;
    sb.auth.onAuthStateChange((ev, s) => {
      if (s && !started) { started = true; afterLogin(s); }
      if (ev === "SIGNED_OUT") { started = false; }
    });
    sb.auth.getSession().then(({ data }) => {
      if (data.session) { if (!started) { started = true; afterLogin(data.session); } }
      else if (!/access_token=|code=/.test(location.href)) loginScreen();
      else setTimeout(() => { if (!started) loginScreen(); }, 2500);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
