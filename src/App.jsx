// build markWrite v2
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

/* ═══════════════════════════════════════════════════════════════════════════
   WeFitYou — v1.0
   File singolo ORGANIZZATO in blocchi che corrispondono alle cartelle future.
   Quando passerai a Vite in locale, ogni blocco ▸ diventa un file/cartella:

     utils/       → helper date, id, formattazione
     data/        → modelli + seed (mock) + costanti
     services/    → CRUD astratto (oggi localStorage, domani Supabase)
     hooks/       → useLocalStore, useToast
     components/  → UI riutilizzabile (Badge, Btn, Card, Toast, Modal…)
     pages/       → Dashboard, Calendario (Login resta a parte)

   REGOLA D'ORO per Supabase (punto 10 del brief):
   nessun componente tocca localStorage direttamente. Tutto passa dai
   "services". Il giorno del collegamento cambi SOLO il blocco services/.
═══════════════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════ utils/ ═══════════════════════════════════════ */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const pad = (n) => String(n).padStart(2, "0");
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const todayStr = () => toStr(new Date());

const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toStr(d);
};

const startOfWeek = (dateStr) => {
  // lunedì come primo giorno
  const d = new Date(dateStr + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toStr(d);
};

const weekDays = (anchorStr) => {
  const start = startOfWeek(anchorStr);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

const fmtLong = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
const fmtDayNum = (d) => new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric" });
const fmtWeekdayShort = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short" });

const isPast = (d) => d < todayStr();
const timeToMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const cmpTime = (a, b) => timeToMin(a) - timeToMin(b);

// confini mese: ritorna {start, end} come stringhe YYYY-MM-DD (end esclusivo)
const monthBounds = (offset = 0) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: toStr(start), end: toStr(end) };
};
const monthLabel = (offset = 0) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
};


/* ═══════════════════════════ data/ ════════════════════════════════════════ */

const ADMIN_PIN = "807002";
const STAFF = ["Alessandro", "Luca", "Nicolò", "Mattia", "Sara"];
const MAX_POSTI = 8;

// Tipi di sessione → guida i colori (punto 7). PT = verde, gruppo = giallo.
const SESSION_TYPES = {
  gruppo: { label: "Gruppo", color: "#E8C800" },
  pt:     { label: "PT",     color: "#2E9E55" },
};

/* Modelli (forma dei dati). Tenerli qui rende esplicito lo schema e
   rispecchia le future tabelle Supabase. I campi "pacchetto" esistono
   ma NON sono mostrati nell'UI 1.0 (stand-by, come concordato). */
const makeCliente = (o = {}) => ({
  id: uid(),
  nome: "", cognome: "", telefono: "", email: "", note: "",
  // stand-by pacchetti — pronti per il futuro, non usati nell'UI ora:
  pacchetto: null, seduteTotali: 0, seduteUsate: 0,
  createdAt: new Date().toISOString(),
  ...o,
});

const makeSlot = (o = {}) => ({
  id: uid(),
  day: todayStr(), time: "09:00", durata: 60, posti: MAX_POSTI,
  tipo: "gruppo", // "gruppo" | "pt"
  createdAt: new Date().toISOString(),
  ...o,
});

const makeBooking = (o = {}) => ({
  id: uid(),
  slotId: null, clienteId: null, clienteName: undefined,
  nota: "", stato: "prenotato", // "prenotato" | "completato"
  createdAt: new Date().toISOString(),
  ...o,
});

const makeEsercizio = (o = {}) => ({
  id: uid(),
  nome: "", serie: "", ripetizioni: "", recupero: "", carico: "", note: "",
  ...o,
});

const makeScheda = (o = {}) => ({
  id: uid(),
  clienteId: null,      // null = modello, altrimenti assegnata a cliente
  nome: "Nuova scheda",
  note: "",
  esercizi: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...o,
});

// Seed minimo: mostra la dashboard viva al primo avvio.
const seed = () => {
  const t = todayStr();
  const c1 = makeCliente({ nome: "Maria", cognome: "Rossi", telefono: "333 1112223" });
  const c2 = makeCliente({ nome: "Luca", cognome: "Bianchi", telefono: "347 4445556" });
  const c3 = makeCliente({ nome: "Sara", cognome: "Verdi" });
  const s1 = makeSlot({ day: t, time: "09:00", tipo: "gruppo", posti: 6 });
  const s2 = makeSlot({ day: t, time: "10:30", tipo: "pt", posti: 1 });
  const s3 = makeSlot({ day: t, time: "18:00", tipo: "gruppo", posti: 8 });
  const s4 = makeSlot({ day: addDays(t, 1), time: "09:00", tipo: "gruppo", posti: 6 });
  return {
    clienti: [c1, c2, c3],
    slots: [s1, s2, s3, s4],
    bookings: [
      makeBooking({ slotId: s1.id, clienteId: c1.id }),
      makeBooking({ slotId: s1.id, clienteId: c2.id }),
      makeBooking({ slotId: s2.id, clienteId: c3.id }),
    ],
    schede: [],
  };
};


/* ═══════════════════════════ services/ ════════════════════════════════════
   UNICO punto che tocca la persistenza — ora Supabase.
   - mapping camelCase (app) ⇄ snake_case (DB)
   - CRUD async + fetch iniziale
   - le pagine NON sono cambiate: stesse firme delle azioni.
═══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = "https://apakxjzhcjlankjhhame.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwYWt4anpoY2psYW5ramhoYW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzQ1ODEsImV4cCI6MjA5ODc1MDU4MX0.x-EPXFmLWswi2P4ozoaKbiubTpj9cSgzXHvibWzgVt8";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── mapping DB → app ──
const rowToBooking = (r) => ({ id: r.id, slotId: r.slot_id, clienteId: r.cliente_id, clienteName: r.cliente_name || undefined, nota: r.nota || "", stato: r.stato || "prenotato", createdAt: r.created_at });
const rowToScheda  = (r) => ({ id: r.id, clienteId: r.cliente_id, nome: r.nome, note: r.note || "", esercizi: r.esercizi || [], createdAt: r.created_at, updatedAt: r.updated_at });
const rowToCliente = (r) => ({ id: r.id, nome: r.nome, cognome: r.cognome || "", telefono: r.telefono || "", email: r.email || "", note: r.note || "", createdAt: r.created_at });
const rowToSlot    = (r) => ({ id: r.id, day: r.day, time: r.time, durata: r.durata, posti: r.posti, tipo: r.tipo || "gruppo", createdAt: r.created_at });

const db = {
  async loadAll() {
    const [c, s, b, sc] = await Promise.all([
      supabase.from("clienti").select("*"),
      supabase.from("slots").select("*"),
      supabase.from("bookings").select("*"),
      supabase.from("schede").select("*"),
    ]);
    return {
      clienti: (c.data || []).map(rowToCliente),
      slots: (s.data || []).map(rowToSlot),
      bookings: (b.data || []).map(rowToBooking),
      schede: (sc.data || []).map(rowToScheda),
    };
  },

  // clienti
  insertCliente: (c) => supabase.from("clienti").insert({ id: c.id, nome: c.nome, cognome: c.cognome, telefono: c.telefono, email: c.email, note: c.note }),
  updateCliente: (id, p) => supabase.from("clienti").update(p).eq("id", id),
  deleteCliente: (id) => supabase.from("clienti").delete().eq("id", id),

  // slots
  insertSlot: (s) => supabase.from("slots").insert({ id: s.id, day: s.day, time: s.time, durata: s.durata, posti: s.posti, tipo: s.tipo }),
  updateSlot: (id, p) => supabase.from("slots").update(p).eq("id", id),
  deleteSlot: (id) => supabase.from("slots").delete().eq("id", id),

  // bookings
  insertBooking: (b) => supabase.from("bookings").insert({ id: b.id, slot_id: b.slotId, cliente_id: (b.clienteId && !String(b.clienteId).startsWith("guest_")) ? b.clienteId : null, cliente_name: b.clienteName, nota: b.nota, stato: b.stato }),
  updateBooking: (id, p) => {
    const patch = {};
    if ("nota" in p) patch.nota = p.nota;
    if ("stato" in p) patch.stato = p.stato;
    if ("slotId" in p) patch.slot_id = p.slotId;
    return supabase.from("bookings").update(patch).eq("id", id);
  },
  deleteBooking: (id) => supabase.from("bookings").delete().eq("id", id),

  // schede
  insertScheda: (sc) => supabase.from("schede").insert({ id: sc.id, cliente_id: sc.clienteId, nome: sc.nome, note: sc.note, esercizi: sc.esercizi }),
  updateScheda: (id, p) => {
    const patch = {};
    if ("nome" in p) patch.nome = p.nome;
    if ("note" in p) patch.note = p.note;
    if ("esercizi" in p) patch.esercizi = p.esercizi;
    if ("clienteId" in p) patch.cliente_id = p.clienteId;
    patch.updated_at = new Date().toISOString();
    return supabase.from("schede").update(patch).eq("id", id);
  },
  deleteScheda: (id) => supabase.from("schede").delete().eq("id", id),

  // realtime: richiama onChange a ogni modifica su qualunque tabella
  subscribe(onChange) {
    const ch = supabase.channel("wfy-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clienti" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "schede" }, onChange)
      .subscribe();
    return () => supabase.removeChannel(ch);
  },
};


/* ═══════════════════════════ hooks/ ═══════════════════════════════════════ */

// Store centrale con Supabase. Optimistic update: aggiorna subito lo stato
// locale (UI reattiva) e scrive sul DB; il realtime riallinea i dispositivi.
function useStore() {
  const [state, setState] = useState({ clienti: [], slots: [], bookings: [], schede: [] });
  const [loading, setLoading] = useState(true);
  // finestra di protezione: dopo una scrittura locale, ignora i reload
  // realtime per un attimo, così non sovrascrivono ciò che abbiamo appena fatto
  const writingUntil = useRef(0);
  const markWrite = () => { writingUntil.current = Date.now() + 2500; };

  const reload = useCallback(async () => {
    const data = await db.loadAll();
    setState(data);
    setLoading(false);
  }, []);

  const reloadSafe = useCallback(async () => {
    if (Date.now() < writingUntil.current) return; // scrittura in corso: non sovrascrivere
    const data = await db.loadAll();
    setState(data);
  }, []);

  useEffect(() => {
    reload();
    const unsub = db.subscribe(() => { reloadSafe(); });
    // aggiorna quando la app torna in primo piano (utile su telefono)
    const onFocus = () => reloadSafe();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { unsub(); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [reload, reloadSafe]);

  const api = useMemo(() => ({
    state,
    loading,

    // ── clienti ──
    addCliente: (data) => {
      const c = makeCliente(data);
      markWrite();
      setState((s) => ({ ...s, clienti: [...s.clienti, c] }));
      db.insertCliente(c);
      return c.id;
    },
    createClienteQuick: (fullName) => {
      const parts = fullName.trim().split(/\s+/);
      const nome = parts.shift() || fullName.trim();
      const cognome = parts.join(" ");
      const c = makeCliente({ nome, cognome });
      markWrite();
      setState((s) => ({ ...s, clienti: [...s.clienti, c] }));
      db.insertCliente(c);
      return c.id;
    },
    updateCliente: (id, patch) => {
      markWrite();
      setState((s) => ({ ...s, clienti: s.clienti.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
      db.updateCliente(id, patch);
    },
    removeCliente: (id) => {
      markWrite();
      setState((s) => ({ ...s, clienti: s.clienti.filter((c) => c.id !== id) }));
      db.deleteCliente(id);
    },

    // ── slots ──
    addSlot: (data) => {
      const slot = makeSlot(data);
      let dup = false;
      markWrite();
      setState((s) => {
        if (s.slots.find((x) => x.day === slot.day && x.time === slot.time)) { dup = true; return s; }
        return { ...s, slots: [...s.slots, slot] };
      });
      if (!dup) db.insertSlot(slot);
      return slot;
    },
    updateSlot: (id, patch) => {
      markWrite();
      setState((s) => ({ ...s, slots: s.slots.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      db.updateSlot(id, patch);
    },
    removeSlot: (id) => {
      let blocked = false;
      markWrite();
      setState((s) => {
        if (s.bookings.some((b) => b.slotId === id)) { blocked = true; return s; }
        return { ...s, slots: s.slots.filter((x) => x.id !== id) };
      });
      if (!blocked) db.deleteSlot(id);
    },

    // ── bookings ──
    addBooking: (data) => {
      const b = makeBooking(data);
      markWrite();
      setState((s) => ({ ...s, bookings: [...s.bookings, b] }));
      db.insertBooking(b);
      return b.id;
    },
    updateBooking: (id, patch) => {
      markWrite();
      setState((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
      db.updateBooking(id, patch);
    },
    removeBooking: (id) => {
      markWrite();
      setState((s) => ({ ...s, bookings: s.bookings.filter((b) => b.id !== id) }));
      db.deleteBooking(id);
    },
    moveBooking: (bookingId, newSlotId) => {
      markWrite();
      setState((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, slotId: newSlotId } : b)) }));
      db.updateBooking(bookingId, { slotId: newSlotId });
    },

    // ── schede ──
    addScheda: (data) => {
      const sc = makeScheda(data);
      markWrite();
      setState((s) => ({ ...s, schede: [...(s.schede || []), sc] }));
      db.insertScheda(sc);
      return sc.id;
    },
    updateScheda: (id, patch) => {
      markWrite();
      setState((s) => ({ ...s, schede: (s.schede || []).map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)) }));
      db.updateScheda(id, patch);
    },
    removeScheda: (id) => {
      markWrite();
      setState((s) => ({ ...s, schede: (s.schede || []).filter((x) => x.id !== id) }));
      db.deleteScheda(id);
    },
    duplicaScheda: (id, { clienteId, nome } = {}) => {
      const src = (state.schede || []).find((x) => x.id === id);
      if (!src) return null;
      const copy = makeScheda({
        ...src,
        id: undefined, createdAt: undefined, updatedAt: undefined,
        clienteId: clienteId !== undefined ? clienteId : src.clienteId,
        nome: nome || src.nome,
        esercizi: src.esercizi.map((e) => makeEsercizio({ ...e, id: undefined })),
      });
      markWrite();
      setState((s) => ({ ...s, schede: [...(s.schede || []), copy] }));
      db.insertScheda(copy);
      return copy.id;
    },
  }), [state, loading]);

  return api;
}

// Toast leggero (punto 9).
function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, kind = "ok") => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);
  return { toasts, push };
}


/* ═══════════════════════════ components/ (design tokens + UI) ═════════════ */

const C = {
  white: "#FFFFFF", bg: "#F5F5F0", surface: "#FFFFFF", border: "#E8E8E0",
  ink: "#111111", inkMid: "#555555", inkFaint: "#AAAAAA",
  yellow: "#E8C800", yellowSoft: "#FFFBE6", yellowText: "#7A6400",
  red: "#E53E2F", redSoft: "#FFF0EE",
  green: "#2E9E55", greenSoft: "#EDFAF1",
  amber: "#CC8800", amberSoft: "#FFF5E0",
  dark: "#111111",
};
const FSERIF = "Space Grotesk, sans-serif";
const FSANS = "Inter, sans-serif";

// Inietta i font Google una sola volta.
function useFonts() {
  useEffect(() => {
    if (document.getElementById("wfy-fonts")) return;
    const l = document.createElement("link");
    l.id = "wfy-fonts";
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
    // keyframe animazioni leggere
    if (!document.getElementById("wfy-anim")) {
      const st = document.createElement("style");
      st.id = "wfy-anim";
      st.textContent = `
        @keyframes wfy-in { from{opacity:0; transform:translateY(4px)} to{opacity:1; transform:none} }
        @keyframes wfy-toast { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
        @media (prefers-reduced-motion: reduce){ *{animation:none!important; transition:none!important} }
      `;
      document.head.appendChild(st);
    }
  }, []);
}

const Badge = ({ children, color = C.yellow, bg = C.yellowSoft }) => (
  <span style={{ background: bg, color, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, fontFamily: FSANS }}>{children}</span>
);

const Btn = ({ variant = "primary", children, style: s, ...p }) => {
  const v = {
    primary: { background: C.yellow, color: C.ink },
    secondary: { background: C.bg, color: C.ink, border: `1.5px solid ${C.border}` },
    danger: { background: C.redSoft, color: C.red },
    ghost: { background: "transparent", color: C.inkMid },
    dark: { background: C.ink, color: C.white },
  }[variant];
  return (
    <button {...p} style={{ ...v, border: v.border || "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FSANS, transition: "opacity .15s, transform .1s", ...s }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}>
      {children}
    </button>
  );
};

const Card = ({ children, style: s, ...p }) => (
  <div {...p} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...s }}>{children}</div>
);

const Input = ({ label, ...p }) => (
  <label style={{ display: "block" }}>
    {label && <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMid, marginBottom: 5, textTransform: "uppercase", letterSpacing: .5, fontFamily: FSANS }}>{label}</div>}
    <input {...p} style={{ width: "100%", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "10px 13px", color: C.ink, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: FSANS, ...p.style }} />
  </label>
);

const Select = ({ label, children, ...p }) => (
  <label style={{ display: "block" }}>
    {label && <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMid, marginBottom: 5, textTransform: "uppercase", letterSpacing: .5, fontFamily: FSANS }}>{label}</div>}
    <select {...p} style={{ width: "100%", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "10px 13px", color: C.ink, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: FSANS, cursor: "pointer" }}>{children}</select>
  </label>
);

const SectionTitle = ({ children, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
    <h2 style={{ fontFamily: FSERIF, fontSize: 26, fontWeight: 800, color: C.ink, margin: 0, letterSpacing: -.5, textTransform: "uppercase" }}>{children}</h2>
    {right}
  </div>
);

const Empty = ({ icon, text }) => (
  <div style={{ textAlign: "center", padding: "40px 20px", color: C.inkFaint }}>
    <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
    <div style={{ fontFamily: FSANS, fontSize: 14 }}>{text}</div>
  </div>
);

// Toast container
const ToastHost = ({ toasts }) => (
  <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 8, zIndex: 300, alignItems: "center" }}>
    {toasts.map((t) => (
      <div key={t.id} style={{
        background: t.kind === "err" ? C.ink : C.ink, color: t.kind === "err" ? C.red : C.yellow,
        padding: "11px 18px", borderRadius: 12, fontFamily: FSANS, fontSize: 13, fontWeight: 600,
        boxShadow: "0 8px 30px rgba(0,0,0,.25)", animation: "wfy-toast .2s ease", maxWidth: "90vw",
      }}>{t.msg}</div>
    ))}
  </div>
);

// Modal centrato semplice, per conferme e form rapidi (punto 9).
const Modal = ({ open, onClose, children, width = 420 }) => {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 18, padding: 24, width, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", animation: "wfy-in .18s ease" }}>
        {children}
      </div>
    </div>
  );
};

// Pastiglia colore per tipo sessione (verde PT / giallo gruppo)
const TypeDot = ({ tipo }) => {
  const t = SESSION_TYPES[tipo] || SESSION_TYPES.gruppo;
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8, background: t.color, marginRight: 6, flexShrink: 0 }} />;
};


/* ═══════════════════════════ components/ · selettore cliente ══════════════
   Ricerca istantanea riutilizzabile: usata nel form prenotazione e (in
   futuro) altrove. Massimo 2 click per scegliere un cliente. */
function ClientePicker({ clienti, value, onChange }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return clienti.filter((c) => `${c.nome} ${c.cognome}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, clienti]);

  // match esatto già registrato?
  const exact = useMemo(() => {
    const s = q.trim().toLowerCase();
    return clienti.find((c) => `${c.nome} ${c.cognome}`.trim().toLowerCase() === s);
  }, [q, clienti]);

  const chooseCliente = (c) => { setQ(`${c.nome} ${c.cognome}`.trim()); onChange({ type: "cliente", id: c.id }); };
  const onType = (val) => {
    setQ(val);
    const s = val.trim();
    if (!s) { onChange(null); return; }
    const ex = clienti.find((c) => `${c.nome} ${c.cognome}`.trim().toLowerCase() === s.toLowerCase());
    // se coincide con un registrato → lo selezioni; altrimenti → nuovo cliente automatico
    onChange(ex ? { type: "cliente", id: ex.id } : { type: "new", name: s });
  };

  const selectedNew = value?.type === "new";

  return (
    <div>
      <Input label="Cliente" placeholder="Cerca o scrivi un nome…" value={q} onChange={(e) => onType(e.target.value)} autoFocus />

      {/* suggerimenti registrati (solo mentre scrivi) */}
      {q.trim() && !exact && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, maxHeight: 190, overflowY: "auto" }}>
          {filtered.map((c) => (
            <button key={c.id} onClick={() => chooseCliente(c)}
              style={{ textAlign: "left", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontFamily: FSANS, fontSize: 14, color: C.ink }}>
              {c.nome} {c.cognome}
            </button>
          ))}
        </div>
      )}

      {/* nuovo cliente automatico */}
      {selectedNew && (
        <div style={{ marginTop: 10, background: C.yellowSoft, border: `1.5px solid ${C.yellow}`, borderRadius: 10, padding: "10px 12px", fontFamily: FSANS, fontSize: 13, color: C.yellowText }}>
          ✨ Nuovo cliente: <strong>{value.name}</strong> — verrà creato e assegnato.
        </div>
      )}
      {value?.type === "cliente" && (
        <div style={{ marginTop: 10, background: C.greenSoft, border: `1.5px solid ${C.green}`, borderRadius: 10, padding: "10px 12px", fontFamily: FSANS, fontSize: 13, color: C.green }}>
          ✓ Cliente registrato selezionato.
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════ pages/ · Login ═══════════════════════════════ */
function LoginPage({ onLogin }) {
  const [pin, setPin] = useState("");
  const [staff, setStaff] = useState(STAFF[0]);
  const [err, setErr] = useState(false);
  const submit = () => (pin === ADMIN_PIN ? onLogin(staff) : setErr(true));
  return (
    <div style={{ minHeight: "100vh", background: C.dark, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 20, padding: 40, width: 340, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.35)", animation: "wfy-in .2s ease" }}>
        <div style={{ fontFamily: FSERIF, fontSize: 34, fontWeight: 800, color: C.yellow, letterSpacing: -1, lineHeight: 1.05, marginBottom: 6 }}>We Fit You</div>
        <div style={{ fontFamily: FSANS, fontSize: 12, color: C.inkMid, marginBottom: 24 }}>Accesso staff</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Select label="Tu sei" value={staff} onChange={(e) => setStaff(e.target.value)}>
            {STAFF.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Input label="PIN" type="password" inputMode="numeric" placeholder="••••" value={pin}
            onChange={(e) => { setPin(e.target.value); setErr(false); }}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
          {err && <div style={{ color: C.red, fontSize: 12, fontFamily: FSANS }}>PIN non corretto.</div>}
          <Btn onClick={submit} style={{ width: "100%" }}>Accedi</Btn>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════ pages/ · Dashboard ═══════════════════════════ */
function DashboardPage({ store, staff, goToCalendar }) {
  const { state } = store;
  const t = todayStr();

  const slotsToday = useMemo(
    () => state.slots.filter((s) => s.day === t).sort((a, b) => cmpTime(a.time, b.time)),
    [state.slots, t]
  );
  const bookingsToday = useMemo(
    () => state.bookings.filter((b) => slotsToday.some((s) => s.id === b.slotId)),
    [state.bookings, slotsToday]
  );

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const inCorso = slotsToday.filter((s) => {
    const start = timeToMin(s.time);
    return nowMin >= start && nowMin < start + (s.durata || 60);
  });

  const postiLiberi = slotsToday.reduce((acc, s) => {
    const occ = state.bookings.filter((b) => b.slotId === s.id).length;
    return acc + Math.max(0, (s.posti || MAX_POSTI) - occ);
  }, 0);

  const nomeCliente = (b) =>
    b.clienteName || (() => { const c = state.clienti.find((x) => x.id === b.clienteId); return c ? `${c.nome} ${c.cognome}` : "Ospite"; })();

  const stat = (label, value, accent) => (
    <Card style={{ flex: "1 1 140px", minWidth: 0, padding: 16, animation: "wfy-in .2s ease" }}>
      <div style={{ fontFamily: FSANS, fontSize: 10.5, fontWeight: 600, color: C.inkMid, textTransform: "uppercase", letterSpacing: .4 }}>{label}</div>
      <div style={{ fontFamily: FSERIF, fontSize: 32, fontWeight: 800, color: accent || C.ink, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
    </Card>
  );

  return (
    <div>
      <SectionTitle right={<Badge color={C.inkMid} bg={C.bg}>{fmtLong(t)}</Badge>}>Ciao, {staff}</SectionTitle>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
        {stat("Presenti oggi", bookingsToday.length)}
        {stat("Appuntamenti", slotsToday.length)}
        {stat("Posti liberi", postiLiberi, postiLiberi === 0 ? C.red : C.green)}
        {stat("In corso ora", inCorso.length, inCorso.length ? C.green : C.inkFaint)}
      </div>

      {/* Timeline di oggi */}
      <SectionTitle right={<Btn variant="secondary" style={{ padding: "7px 14px", fontSize: 12 }} onClick={goToCalendar}>Apri calendario →</Btn>}>Oggi</SectionTitle>

      {slotsToday.length === 0 ? (
        <Card><Empty icon="🗓️" text="Nessuna sessione in programma oggi. Aprine una dal calendario." /></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {slotsToday.map((s) => {
            const occ = state.bookings.filter((b) => b.slotId === s.id);
            const posti = s.posti || MAX_POSTI;
            const pieno = occ.length >= posti;
            const running = inCorso.some((x) => x.id === s.id);
            const typeColor = (SESSION_TYPES[s.tipo] || SESSION_TYPES.gruppo).color;
            return (
              <Card key={s.id} style={{
                display: "flex", alignItems: "center", gap: 16, padding: "14px 18px",
                borderLeft: `4px solid ${typeColor}`, animation: "wfy-in .2s ease",
                background: running ? C.greenSoft : C.surface,
              }}>
                <div style={{ textAlign: "center", minWidth: 54 }}>
                  <div style={{ fontFamily: FSERIF, fontSize: 20, fontWeight: 800, color: C.ink }}>{s.time}</div>
                  <div style={{ fontFamily: FSANS, fontSize: 11, color: C.inkFaint }}>{s.durata}'</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FSANS, fontWeight: 700, fontSize: 14, color: C.ink }}>
                      <TypeDot tipo={s.tipo} />{(SESSION_TYPES[s.tipo] || SESSION_TYPES.gruppo).label}
                    </span>
                    {running && <Badge color={C.green} bg={C.greenSoft}>● In corso</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {occ.length === 0
                      ? <span style={{ fontFamily: FSANS, fontSize: 13, color: C.inkFaint }}>Nessuna prenotazione</span>
                      : occ.map((b) => (
                        <span key={b.id} style={{ fontFamily: FSANS, fontSize: 12, background: C.bg, color: C.ink, borderRadius: 6, padding: "2px 8px" }}>
                          {nomeCliente(b).split(" ")[0]}
                        </span>
                      ))}
                  </div>
                </div>
                <Badge color={pieno ? C.red : C.green} bg={pieno ? C.redSoft : C.greenSoft}>{occ.length}/{posti}</Badge>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════ pages/ · Calendario ══════════════════════════
   Vista Giorno e Settimana. Ogni prenotazione: modifica nota, sposta di
   slot, elimina — tutto da un modal a 1-2 click. Creazione slot rapida. */
function CalendarPage({ store, toast }) {
  const { state } = store;
  const [view, setView] = useState("day");         // "day" | "week"
  const [anchor, setAnchor] = useState(todayStr()); // giorno di riferimento

  // modali
  const [newSlotFor, setNewSlotFor] = useState(null);   // day string
  const [bookingFor, setBookingFor] = useState(null);   // slot
  const [editBooking, setEditBooking] = useState(null); // booking

  const days = view === "day" ? [anchor] : weekDays(anchor);

  const slotsOf = (day) => state.slots.filter((s) => s.day === day).sort((a, b) => cmpTime(a.time, b.time));
  const occOf = (slotId) => state.bookings.filter((b) => b.slotId === slotId);
  const nomeCliente = (b) =>
    b.clienteName || (() => { const c = state.clienti.find((x) => x.id === b.clienteId); return c ? `${c.nome} ${c.cognome}` : "Ospite"; })();

  const shift = (n) => setAnchor((a) => addDays(a, view === "day" ? n : n * 7));

  const rangeLabel = view === "day"
    ? fmtLong(anchor)
    : `${fmtShort(days[0])} — ${fmtShort(days[6])}`;

  return (
    <div>
      <SectionTitle right={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant={view === "day" ? "primary" : "secondary"} style={{ padding: "7px 14px", fontSize: 12 }} onClick={() => setView("day")}>Giorno</Btn>
          <Btn variant={view === "week" ? "primary" : "secondary"} style={{ padding: "7px 14px", fontSize: 12 }} onClick={() => setView("week")}>Settimana</Btn>
        </div>
      }>Calendario</SectionTitle>

      {/* Navigazione */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <Btn variant="secondary" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => shift(-1)}>←</Btn>
        <Btn variant="secondary" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => setAnchor(todayStr())}>Oggi</Btn>
        <Btn variant="secondary" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => shift(1)}>→</Btn>
        <span style={{ fontFamily: FSANS, fontSize: 14, fontWeight: 600, color: C.inkMid, textTransform: "capitalize" }}>{rangeLabel}</span>
      </div>

      {/* Griglia giorni */}
      <div style={{
        display: "grid",
        gridTemplateColumns: view === "day" ? "minmax(0, 1fr)" : "repeat(7, minmax(130px, 1fr))",
        gap: 12,
        overflowX: view === "week" ? "auto" : "visible",
        paddingBottom: view === "week" ? 6 : 0,
      }}>
        {days.map((day) => {
          const dSlots = slotsOf(day);
          const today = day === todayStr();
          return (
            <div key={day} style={{ background: C.surface, border: `1.5px solid ${today ? C.yellow : C.border}`, borderRadius: 14, padding: 14, minHeight: 120 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: FSANS, fontSize: 11, fontWeight: 700, color: today ? C.yellowText : C.inkMid, textTransform: "uppercase", letterSpacing: .5 }}>
                  {view === "week"
                    ? `${fmtWeekdayShort(day)} ${fmtDayNum(day)}`
                    : `${fmtWeekdayShort(day)} ${fmtDayNum(day)}${today ? " · Oggi" : ""}`}
                </div>
                <button onClick={() => setNewSlotFor(day)} title="Aggiungi sessione"
                  style={{ background: C.yellowSoft, color: C.yellowText, border: "none", borderRadius: 8, width: 26, height: 26, cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1 }}>+</button>
              </div>

              {dSlots.length === 0 && (
                <div style={{ fontFamily: FSANS, fontSize: 12, color: C.inkFaint }}>—</div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dSlots.map((s) => {
                  const occ = occOf(s.id);
                  const posti = s.posti || MAX_POSTI;
                  const pieno = occ.length >= posti;
                  const typeColor = (SESSION_TYPES[s.tipo] || SESSION_TYPES.gruppo).color;
                  return (
                    <div key={s.id} style={{ border: `1px solid ${C.border}`, borderLeft: `4px solid ${typeColor}`, borderRadius: 10, padding: "8px 10px", animation: "wfy-in .18s ease" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: FSERIF, fontWeight: 800, fontSize: 15, color: C.ink }}>{s.time}</span>
                        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <Badge color={pieno ? C.red : C.green} bg={pieno ? C.redSoft : C.greenSoft}>{occ.length}/{posti}</Badge>
                          {occ.length === 0 && (
                            <button onClick={() => { store.removeSlot(s.id); toast("Sessione eliminata"); }}
                              title="Elimina sessione"
                              style={{ background: "transparent", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 14 }}>✕</button>
                          )}
                        </span>
                      </div>
                      {/* clienti prenotati (tap → modifica/sposta/elimina) */}
                      {occ.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                          {occ.map((b) => (
                            <button key={b.id} onClick={() => setEditBooking({ booking: b, slot: s })}
                              style={{ fontFamily: FSANS, fontSize: 12, background: C.bg, color: C.ink, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>
                              {nomeCliente(b).split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      )}
                      {!pieno && (
                        <button onClick={() => setBookingFor(s)}
                          style={{ marginTop: 8, width: "100%", background: C.ink, color: C.yellow, border: "none", borderRadius: 8, padding: "6px 0", fontSize: 12, fontWeight: 600, fontFamily: FSANS, cursor: "pointer" }}>
                          + Prenota
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal: nuova sessione ── */}
      <NewSlotModal open={!!newSlotFor} day={newSlotFor} onClose={() => setNewSlotFor(null)}
        onCreate={(data) => { store.addSlot(data); setNewSlotFor(null); toast("Sessione creata"); }} />

      {/* ── Modal: prenota su slot ── */}
      <BookingModal open={!!bookingFor} slot={bookingFor} clienti={state.clienti}
        onClose={() => setBookingFor(null)}
        onConfirm={({ slotId, nota, scelta }) => {
          let payload = { slotId, nota };
          if (scelta.type === "cliente") {
            payload.clienteId = scelta.id;
          } else {
            // nuovo cliente: lo creo nell'archivio e lo assegno
            const id = store.createClienteQuick(scelta.name);
            payload.clienteId = id;
          }
          store.addBooking(payload);
          setBookingFor(null);
          toast(scelta.type === "new" ? "Cliente creato e prenotato" : "Prenotazione aggiunta");
        }} />

      {/* ── Modal: modifica/sposta/elimina prenotazione ── */}
      <EditBookingModal open={!!editBooking} data={editBooking}
        slots={state.slots}
        onClose={() => setEditBooking(null)}
        onSave={(patch) => { store.updateBooking(editBooking.booking.id, patch); setEditBooking(null); toast("Prenotazione aggiornata"); }}
        onMove={(newSlotId) => { store.moveBooking(editBooking.booking.id, newSlotId); setEditBooking(null); toast("Prenotazione spostata"); }}
        onDelete={() => { store.removeBooking(editBooking.booking.id); setEditBooking(null); toast("Prenotazione eliminata"); }}
      />
    </div>
  );
}

/* ── modali del calendario (components/) ── */

function NewSlotModal({ open, day, onClose, onCreate }) {
  const [time, setTime] = useState("09:00");
  const [durata, setDurata] = useState(60);
  const [posti, setPosti] = useState(6);
  const [tipo, setTipo] = useState("gruppo");
  useEffect(() => { if (open) { setTime("09:00"); setDurata(60); setPosti(6); setTipo("gruppo"); } }, [open]);
  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ fontFamily: FSERIF, fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Nuova sessione</div>
      <div style={{ fontFamily: FSANS, fontSize: 13, color: C.inkMid, marginBottom: 18, textTransform: "capitalize" }}>{day && fmtLong(day)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
        <label style={{ display: "block" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMid, marginBottom: 5, textTransform: "uppercase", letterSpacing: .5, fontFamily: FSANS }}>Orario</div>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: "100%", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "10px 13px", fontSize: 15, fontWeight: 700, fontFamily: FSANS, outline: "none", boxSizing: "border-box" }} />
        </label>
        <Select label="Tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); if (e.target.value === "pt") setPosti(1); }}>
          <option value="gruppo">Gruppo</option>
          <option value="pt">PT (1-a-1)</option>
        </Select>
        <Select label="Durata" value={durata} onChange={(e) => setDurata(Number(e.target.value))}>
          {[30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} min</option>)}
        </Select>
        <Select label="Posti" value={posti} onChange={(e) => setPosti(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={() => onCreate({ day, time, durata, posti, tipo })} style={{ flex: 1 }}>Crea sessione</Btn>
        <Btn variant="secondary" onClick={onClose}>Annulla</Btn>
      </div>
    </Modal>
  );
}

function BookingModal({ open, slot, clienti, onClose, onConfirm }) {
  const [sel, setSel] = useState(null);
  const [nota, setNota] = useState("");
  useEffect(() => { if (open) { setSel(null); setNota(""); } }, [open]);
  if (!slot) return null;
  const build = () => {
    if (!sel) return;
    // il genitore riceve la scelta: cliente esistente o nuovo da creare
    onConfirm({ slotId: slot.id, nota, scelta: sel });
  };
  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ fontFamily: FSERIF, fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Prenota</div>
      <div style={{ fontFamily: FSANS, fontSize: 13, color: C.inkMid, marginBottom: 18, textTransform: "capitalize" }}>{fmtLong(slot.day)} · {slot.time}</div>
      <ClientePicker clienti={clienti} value={sel} onChange={setSel} />
      <div style={{ marginTop: 12 }}>
        <Input label="Nota (opzionale)" placeholder="Es. riscaldamento extra" value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Btn onClick={build} style={{ flex: 1, opacity: sel ? 1 : .4 }}>Conferma</Btn>
        <Btn variant="secondary" onClick={onClose}>Annulla</Btn>
      </div>
    </Modal>
  );
}

function EditBookingModal({ open, data, slots, onClose, onSave, onMove, onDelete }) {
  const [nota, setNota] = useState("");
  const [moveTo, setMoveTo] = useState("");
  useEffect(() => { if (open && data) { setNota(data.booking.nota || ""); setMoveTo(""); } }, [open, data]);
  if (!data) return null;
  const { booking, slot } = data;
  // slot alternativi validi per lo spostamento (stesso schema, altri orari/giorni)
  const targets = slots
    .filter((s) => s.id !== slot.id)
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
    .slice(0, 40);
  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ fontFamily: FSERIF, fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Prenotazione</div>
      <div style={{ fontFamily: FSANS, fontSize: 13, color: C.inkMid, marginBottom: 18, textTransform: "capitalize" }}>{fmtLong(slot.day)} · {slot.time}</div>

      <Input label="Nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="—" />

      <div style={{ marginTop: 14 }}>
        <Select label="Sposta su un'altra sessione" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          <option value="">— Mantieni qui —</option>
          {targets.map((s) => (
            <option key={s.id} value={s.id}>{fmtShort(s.day)} · {s.time} ({(SESSION_TYPES[s.tipo] || SESSION_TYPES.gruppo).label})</option>
          ))}
        </Select>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
        {moveTo
          ? <Btn onClick={() => onMove(moveTo)} style={{ flex: 1 }}>Sposta qui</Btn>
          : <Btn onClick={() => onSave({ nota })} style={{ flex: 1 }}>Salva</Btn>}
        <Btn variant="danger" onClick={onDelete}>Elimina</Btn>
      </div>
    </Modal>
  );
}


/* ═══════════════════════════ pages/ · Clienti ═════════════════════════════
   Archivio con ricerca istantanea. Ogni cliente: nome, cognome, telefono,
   email, note. Tap su una card → modifica. (Pacchetti/sedute in stand-by.) */
function ClientiPage({ store, toast }) {
  const { state } = store;
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);  // cliente in modifica
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = [...state.clienti].sort((a, b) =>
      `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, "it"));
    if (!s) return base;
    return base.filter((c) =>
      `${c.nome} ${c.cognome} ${c.telefono} ${c.email}`.toLowerCase().includes(s));
  }, [q, state.clienti]);

  const bookingsCount = (id) => state.bookings.filter((b) => b.clienteId === id).length;

  return (
    <div>
      <SectionTitle right={<Badge color={C.inkMid} bg={C.bg}>{state.clienti.length} in archivio</Badge>}>Clienti</SectionTitle>

      {/* barra ricerca + nuovo */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Input placeholder="Cerca per nome, telefono, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Btn onClick={() => setCreating(true)}>+ Nuovo</Btn>
      </div>

      {list.length === 0 ? (
        <Card><Empty icon="👤" text={q ? "Nessun cliente trovato." : "Ancora nessun cliente. Aggiungine uno."} /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {list.map((c) => {
            const n = bookingsCount(c.id);
            return (
              <Card key={c.id} onClick={() => setEdit(c)} style={{ cursor: "pointer", animation: "wfy-in .18s ease" }}>
                <div style={{ fontFamily: FSERIF, fontSize: 18, fontWeight: 800, color: C.ink, marginBottom: 6 }}>
                  {c.nome} {c.cognome}
                </div>
                {c.telefono && <div style={{ fontFamily: FSANS, fontSize: 13, color: C.inkMid, marginBottom: 3 }}>📞 {c.telefono}</div>}
                {c.email && <div style={{ fontFamily: FSANS, fontSize: 13, color: C.inkMid, marginBottom: 3 }}>✉️ {c.email}</div>}
                {c.note && <div style={{ fontFamily: FSANS, fontSize: 12, color: C.amber, marginTop: 6, lineHeight: 1.4 }}>⚕️ {c.note}</div>}
                <div style={{ marginTop: 10 }}>
                  <Badge color={n > 0 ? C.green : C.inkFaint} bg={n > 0 ? C.greenSoft : C.bg}>
                    {n} {n === 1 ? "prenotazione" : "prenotazioni"}
                  </Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* nuovo */}
      <ClienteModal open={creating} store={store} onClose={() => setCreating(false)}
        onSave={(data) => { store.addCliente(data); setCreating(false); toast("Cliente aggiunto"); }} />

      {/* modifica */}
      <ClienteModal open={!!edit} cliente={edit} store={store} onClose={() => setEdit(null)}
        slots={state.slots} bookings={state.bookings} toast={toast}
        onSave={(data) => { store.updateCliente(edit.id, data); setEdit(null); toast("Cliente aggiornato"); }}
        onDelete={() => {
          if (bookingsCount(edit.id) > 0) { toast("Ha prenotazioni: rimuovile prima", "err"); return; }
          store.removeCliente(edit.id); setEdit(null); toast("Cliente eliminato");
        }} />
    </div>
  );
}

function ClienteModal({ open, cliente, store, slots = [], bookings = [], toast, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ nome: "", cognome: "", telefono: "", email: "", note: "" });
  const [schedaOpen, setSchedaOpen] = useState(null); // id scheda in editing
  const [assignPick, setAssignPick] = useState(false);
  useEffect(() => {
    if (open) { setF({
      nome: cliente?.nome || "", cognome: cliente?.cognome || "",
      telefono: cliente?.telefono || "", email: cliente?.email || "", note: cliente?.note || "",
    }); setSchedaOpen(null); setAssignPick(false); }
  }, [open, cliente]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valid = f.nome.trim().length > 0;

  // sedute effettuate (slot con data ≤ oggi) per mese corrente e precedente
  const stats = useMemo(() => {
    if (!cliente) return null;
    const t = todayStr();
    const cur = monthBounds(0), prev = monthBounds(-1);
    let curN = 0, prevN = 0;
    for (const b of bookings) {
      if (b.clienteId !== cliente.id) continue;
      const s = slots.find((x) => x.id === b.slotId);
      if (!s || s.day > t) continue;
      if (s.day >= cur.start && s.day < cur.end) curN++;
      else if (s.day >= prev.start && s.day < prev.end) prevN++;
    }
    return { curN, prevN, curLabel: monthLabel(0), prevLabel: monthLabel(-1) };
  }, [cliente, slots, bookings]);

  // schede del cliente + modelli disponibili
  const stateSchede = store?.state.schede || [];
  const schedeCliente = cliente ? stateSchede.filter((s) => s.clienteId === cliente.id) : [];
  const modelli = stateSchede.filter((s) => !s.clienteId);
  const schedaAperta = stateSchede.find((s) => s.id === schedaOpen);

  return (
    <Modal open={open} onClose={onClose} width={520}>
      <div style={{ fontFamily: FSERIF, fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 18 }}>
        {cliente ? "Scheda cliente" : "Nuovo cliente"}
      </div>

      {/* riepilogo sedute (solo in modifica) */}
      {cliente && stats && (
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, background: C.greenSoft, border: `1.5px solid ${C.green}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontFamily: FSANS, fontSize: 10.5, fontWeight: 600, color: C.green, textTransform: "capitalize" }}>{stats.curLabel}</div>
            <div style={{ fontFamily: FSERIF, fontSize: 28, fontWeight: 800, color: C.ink, lineHeight: 1.1 }}>{stats.curN}<span style={{ fontSize: 13, fontWeight: 400, color: C.inkMid }}> sedute</span></div>
          </div>
          <div style={{ flex: 1, background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontFamily: FSANS, fontSize: 10.5, fontWeight: 600, color: C.inkMid, textTransform: "capitalize" }}>{stats.prevLabel}</div>
            <div style={{ fontFamily: FSERIF, fontSize: 28, fontWeight: 800, color: C.inkMid, lineHeight: 1.1 }}>{stats.prevN}<span style={{ fontSize: 13, fontWeight: 400, color: C.inkFaint }}> sedute</span></div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Nome *" value={f.nome} onChange={set("nome")} placeholder="Maria" autoFocus />
        <Input label="Cognome" value={f.cognome} onChange={set("cognome")} placeholder="Rossi" />
        <Input label="Telefono" value={f.telefono} onChange={set("telefono")} placeholder="333 123 4567" />
        <Input label="Email" value={f.email} onChange={set("email")} placeholder="maria@email.it" />
        <div style={{ gridColumn: "1/-1" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMid, marginBottom: 5, textTransform: "uppercase", letterSpacing: .5, fontFamily: FSANS }}>Note</div>
          <textarea value={f.note} onChange={set("note")} placeholder="Es. lombalgia cronica, preferisce mattina…"
            style={{ width: "100%", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "10px 13px", color: C.ink, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: FSANS, resize: "vertical", minHeight: 70 }} />
        </div>
      </div>

      {/* SCHEDE — solo per cliente esistente */}
      {cliente && store && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: FSERIF, fontSize: 16, fontWeight: 800, color: C.ink }}>Schede allenamento</div>
            <div style={{ display: "flex", gap: 6 }}>
              {modelli.length > 0 && <Btn variant="secondary" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => setAssignPick((v) => !v)}>Da modello</Btn>}
              <Btn style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => { const id = store.addScheda({ clienteId: cliente.id, nome: "Nuova scheda" }); setSchedaOpen(id); }}>+ Nuova</Btn>
            </div>
          </div>

          {/* picker modello */}
          {assignPick && (
            <div style={{ background: C.yellowSoft, border: `1.5px solid ${C.yellow}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontFamily: FSANS, fontSize: 12, fontWeight: 600, color: C.yellowText, marginBottom: 8 }}>Duplica un modello per questo cliente:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {modelli.map((m) => (
                  <button key={m.id} onClick={() => { const id = store.duplicaScheda(m.id, { clienteId: cliente.id, nome: m.nome }); setAssignPick(false); setSchedaOpen(id); toast && toast("Scheda assegnata"); }}
                    style={{ textAlign: "left", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontFamily: FSANS, fontSize: 14, color: C.ink }}>
                    {m.nome} <span style={{ color: C.inkFaint, fontSize: 12 }}>· {m.esercizi.length} es.</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {schedeCliente.length === 0
            ? <div style={{ fontFamily: FSANS, fontSize: 13, color: C.inkFaint }}>Nessuna scheda assegnata.</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {schedeCliente.map((s) => (
                  <button key={s.id} onClick={() => setSchedaOpen(s.id)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", cursor: "pointer", fontFamily: FSANS }}>
                    <span style={{ fontWeight: 600, color: C.ink, fontSize: 14 }}>{s.nome}</span>
                    <Badge color={C.inkMid} bg={C.white}>{s.esercizi.length} es.</Badge>
                  </button>
                ))}
              </div>
            )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
        <Btn onClick={() => onSave(f)} style={{ flex: 1, opacity: valid ? 1 : .4 }}>Salva</Btn>
        {cliente && onDelete && <Btn variant="danger" onClick={onDelete}>Elimina</Btn>}
        <Btn variant="secondary" onClick={onClose}>Chiudi</Btn>
      </div>

      {/* editor scheda del cliente (modal sopra modal) */}
      <Modal open={!!schedaAperta} onClose={() => setSchedaOpen(null)} width={560}>
        {schedaAperta && (
          <SchedaEditor scheda={schedaAperta}
            clientiName={cliente ? `${cliente.nome} ${cliente.cognome}` : ""}
            onChange={(sc) => store.updateScheda(schedaAperta.id, sc)}
            onClose={() => setSchedaOpen(null)}
            onDuplica={() => { const id = store.duplicaScheda(schedaAperta.id, { nome: schedaAperta.nome + " (copia)" }); setSchedaOpen(id); toast && toast("Scheda duplicata"); }}
            onDelete={() => { store.removeScheda(schedaAperta.id); setSchedaOpen(null); toast && toast("Scheda eliminata"); }}
          />
        )}
      </Modal>
    </Modal>
  );
}


/* ═══════════════════════════ components/ · Editor scheda ══════════════════
   Riutilizzato per modelli e schede cliente. Card per esercizio (mobile-first):
   nome grande + valori come mini-etichette, note sotto. */
function SchedaEditor({ scheda, onChange, onClose, onDuplica, onDelete, clientiName }) {
  const setField = (k, v) => onChange({ ...scheda, [k]: v });
  const addEs = () => onChange({ ...scheda, esercizi: [...scheda.esercizi, makeEsercizio()] });
  const setEs = (id, k, v) => onChange({ ...scheda, esercizi: scheda.esercizi.map((e) => (e.id === id ? { ...e, [k]: v } : e)) });
  const dupEs = (id) => {
    const i = scheda.esercizi.findIndex((e) => e.id === id);
    const copy = makeEsercizio({ ...scheda.esercizi[i], id: undefined });
    const arr = [...scheda.esercizi]; arr.splice(i + 1, 0, copy);
    onChange({ ...scheda, esercizi: arr });
  };
  const delEs = (id) => onChange({ ...scheda, esercizi: scheda.esercizi.filter((e) => e.id !== id) });
  const moveEs = (id, dir) => {
    const i = scheda.esercizi.findIndex((e) => e.id === id);
    const j = i + dir;
    if (j < 0 || j >= scheda.esercizi.length) return;
    const arr = [...scheda.esercizi];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange({ ...scheda, esercizi: arr });
  };

  const miniField = (es, k, label, ph) => (
    <label style={{ display: "block", flex: 1, minWidth: 64 }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: C.inkFaint, textTransform: "uppercase", letterSpacing: .4, marginBottom: 3, fontFamily: FSANS }}>{label}</div>
      <input value={es[k]} onChange={(e) => setEs(es.id, k, e.target.value)} placeholder={ph}
        style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: FSANS, outline: "none", boxSizing: "border-box", color: C.ink }} />
    </label>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <input value={scheda.nome} onChange={(e) => setField("nome", e.target.value)} placeholder="Nome scheda"
            style={{ width: "100%", background: "transparent", border: "none", borderBottom: `2px solid ${C.border}`, fontFamily: FSERIF, fontSize: 22, fontWeight: 800, color: C.ink, outline: "none", padding: "2px 0" }} />
          <div style={{ fontFamily: FSANS, fontSize: 12, color: C.inkMid, marginTop: 6 }}>
            {scheda.clienteId ? `Assegnata a ${clientiName || "cliente"}` : "Modello riutilizzabile"} · {scheda.esercizi.length} esercizi
          </div>
        </div>
        <button onClick={onClose} style={{ background: C.bg, border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: C.inkMid, flexShrink: 0 }}>✕</button>
      </div>

      {/* esercizi */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {scheda.esercizi.length === 0 && <Empty icon="🏋️" text="Nessun esercizio. Aggiungi il primo." />}
        {scheda.esercizi.map((es, idx) => (
          <div key={es.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, animation: "wfy-in .16s ease" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontFamily: FSERIF, fontWeight: 800, color: C.inkFaint, fontSize: 15, minWidth: 20 }}>{idx + 1}</span>
              <input value={es.nome} onChange={(e) => setEs(es.id, "nome", e.target.value)} placeholder="Nome esercizio"
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 600, fontFamily: FSANS, outline: "none", color: C.ink }} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {miniField(es, "serie", "Serie", "3")}
              {miniField(es, "ripetizioni", "Rip.", "8-12")}
              {miniField(es, "recupero", "Rec.", "90\"")}
              {miniField(es, "carico", "Carico", "10 kg")}
            </div>
            <input value={es.note} onChange={(e) => setEs(es.id, "note", e.target.value)} placeholder="Note (opzionale)"
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: FSANS, outline: "none", boxSizing: "border-box", color: C.amber, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button onClick={() => moveEs(es.id, -1)} disabled={idx === 0} title="Su" style={{ background: C.bg, border: "none", borderRadius: 7, width: 30, height: 28, cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? .3 : 1, fontSize: 13 }}>↑</button>
              <button onClick={() => moveEs(es.id, 1)} disabled={idx === scheda.esercizi.length - 1} title="Giù" style={{ background: C.bg, border: "none", borderRadius: 7, width: 30, height: 28, cursor: "pointer", opacity: idx === scheda.esercizi.length - 1 ? .3 : 1, fontSize: 13 }}>↓</button>
              <button onClick={() => dupEs(es.id)} title="Duplica" style={{ background: C.bg, border: "none", borderRadius: 7, width: 30, height: 28, cursor: "pointer", fontSize: 13 }}>⧉</button>
              <button onClick={() => delEs(es.id)} title="Elimina" style={{ background: C.redSoft, color: C.red, border: "none", borderRadius: 7, width: 30, height: 28, cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <Btn variant="secondary" onClick={addEs} style={{ width: "100%", marginTop: 12 }}>+ Aggiungi esercizio</Btn>

      {/* note generali */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMid, marginBottom: 5, textTransform: "uppercase", letterSpacing: .5, fontFamily: FSANS }}>Note scheda</div>
        <textarea value={scheda.note} onChange={(e) => setField("note", e.target.value)} placeholder="Es. 3 volte a settimana, riscaldamento 10'…"
          style={{ width: "100%", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "10px 13px", color: C.ink, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: FSANS, resize: "vertical", minHeight: 60 }} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        {onDuplica && <Btn variant="secondary" onClick={onDuplica}>⧉ Duplica</Btn>}
        {onDelete && <Btn variant="danger" onClick={onDelete}>Elimina scheda</Btn>}
        <Btn onClick={onClose} style={{ flex: 1 }}>Fatto</Btn>
      </div>
    </div>
  );
}


/* ═══════════════════════════ pages/ · Modelli ═════════════════════════════ */
function ModelliPage({ store, toast }) {
  const { state } = store;
  const modelli = (state.schede || []).filter((s) => !s.clienteId);
  const [openId, setOpenId] = useState(null);
  const aperta = modelli.find((s) => s.id === openId);

  return (
    <div>
      <SectionTitle right={<Btn onClick={() => { const id = store.addScheda({ nome: "Nuovo modello" }); setOpenId(id); }}>+ Nuovo</Btn>}>Modelli scheda</SectionTitle>

      {modelli.length === 0 ? (
        <Card><Empty icon="📋" text="Nessun modello. Creane uno riutilizzabile per i tuoi clienti." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {modelli.map((s) => (
            <Card key={s.id} onClick={() => setOpenId(s.id)} style={{ cursor: "pointer", animation: "wfy-in .16s ease" }}>
              <div style={{ fontFamily: FSERIF, fontSize: 18, fontWeight: 800, color: C.ink, marginBottom: 6 }}>{s.nome}</div>
              <Badge color={C.inkMid} bg={C.bg}>{s.esercizi.length} esercizi</Badge>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!aperta} onClose={() => setOpenId(null)} width={560}>
        {aperta && (
          <SchedaEditor scheda={aperta}
            onChange={(sc) => store.updateScheda(aperta.id, sc)}
            onClose={() => setOpenId(null)}
            onDuplica={() => { const id = store.duplicaScheda(aperta.id, { nome: aperta.nome + " (copia)" }); setOpenId(id); toast("Modello duplicato"); }}
            onDelete={() => { store.removeScheda(aperta.id); setOpenId(null); toast("Modello eliminato"); }}
          />
        )}
      </Modal>
    </div>
  );
}


/* ═══════════════════════════ app root ═════════════════════════════════════ */

const NAV = [
  { id: "dashboard", icon: "🏠", label: "Home" },
  { id: "calendario", icon: "📅", label: "Calendario" },
  { id: "clienti", icon: "👥", label: "Clienti" },
  { id: "modelli", icon: "📋", label: "Modelli" },
];

export default function App() {
  useFonts();
  const store = useStore();
  const { toasts, push } = useToast();
  const [staff, setStaff] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [mobile, setMobile] = useState(typeof window !== "undefined" && window.innerWidth < 760);

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 760);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  if (!staff) return <LoginPage onLogin={setStaff} />;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: FSANS }}>
      {/* Sidebar desktop */}
      {!mobile && (
        <aside style={{ width: 220, background: C.dark, minHeight: "100vh", display: "flex", flexDirection: "column", padding: "30px 14px", boxSizing: "border-box", flexShrink: 0 }}>
          <div style={{ marginBottom: 26, paddingBottom: 22, borderBottom: "1px solid #2a2a2a" }}>
            <div style={{ fontFamily: FSERIF, fontSize: 22, fontWeight: 800, color: C.yellow, letterSpacing: -.5, lineHeight: 1.05 }}>We Fit You</div>
            <div style={{ fontFamily: FSANS, fontSize: 11, color: "#666", marginTop: 6 }}>👤 {staff}</div>
          </div>
          <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => setTab(n.id)} style={{
                background: tab === n.id ? C.yellow : "transparent", color: tab === n.id ? C.ink : "#999",
                border: "none", borderRadius: 10, padding: "11px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600,
                fontFamily: FSANS, display: "flex", alignItems: "center", gap: 10, textAlign: "left", transition: "all .15s",
              }}>
                <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
              </button>
            ))}
          </nav>
          <button onClick={() => setStaff(null)} style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: 10, color: "#777", padding: "9px 14px", cursor: "pointer", fontSize: 12, fontFamily: FSANS }}>Esci</button>
        </aside>
      )}

      {/* Contenuto */}
      <main style={{ flex: 1, padding: mobile ? "20px 16px 96px" : "34px 36px", overflowY: "auto", maxWidth: mobile ? "100%" : 1000, width: "100%" }}>
        {store.loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12, color: C.inkFaint }}>
            <div style={{ fontFamily: FSERIF, fontSize: 22, fontWeight: 800, color: C.yellow }}>We Fit You</div>
            <div style={{ fontFamily: FSANS, fontSize: 13 }}>Sincronizzazione in corso…</div>
          </div>
        ) : (
          <>
            {tab === "dashboard" && <DashboardPage store={store} staff={staff} goToCalendar={() => setTab("calendario")} />}
            {tab === "calendario" && <CalendarPage store={store} toast={push} />}
            {tab === "clienti" && <ClientiPage store={store} toast={push} />}
            {tab === "modelli" && <ModelliPage store={store} toast={push} />}
          </>
        )}
      </main>

      {/* Bottom nav mobile */}
      {mobile && (
        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.dark, display: "flex", zIndex: 100, borderTop: "1px solid #2a2a2a", padding: "8px 0 calc(8px + env(safe-area-inset-bottom))" }}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", color: tab === n.id ? C.yellow : "#888", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0", fontFamily: FSANS }}>
              <span style={{ fontSize: 18 }}>{n.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{n.label}</span>
            </button>
          ))}
        </nav>
      )}

      <ToastHost toasts={toasts} />
    </div>
  );
}
