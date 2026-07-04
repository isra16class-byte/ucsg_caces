import { useState, useEffect, useCallback } from "react";
import {
  Upload, CheckCircle2, FileText, TableProperties,
  ExternalLink, AlertCircle, BarChart2, Plus, ChevronLeft, FolderOpen, Download,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN: cambia esto según dónde corra tu Django.
// ─────────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8000";

// ── Tipos que vienen de la API (coinciden con tus serializers de Django) ──
interface Cohorte { id: number; nombre: string; activo: boolean; }

interface Asignatura { id: number; cohorte: number; nombre: string; docente: string; }

interface Evidencia {
  id: number;
  asignatura: number;
  tipo: "malla" | "syllabus" | "acta";
  tipo_display: string;
  archivo_url: string;
  archivo_nombre: string;
  fecha_subida: string;
}

interface Resultado {
  asignatura: Asignatura;
  resultado_final: number;
  escala: string;
  color_escala: string;
  evidencias_info: Record<string, { subida: boolean; label: string }>;
  total_evidencias: number;
  ef_disponible: boolean;
  ef1: number; ef2: number; ef3: number; ef4: number; ef5: number;
  ef_puntaje: number;
  respuestas: number;
  promedio_general: number;
}

interface ResultadoCohorte {
  cohorte: Cohorte;
  resultado_final: number;
  escala: string;
  color_escala: string;
  ef1: number; ef2: number; ef3: number; ef4: number; ef5: number;
  ef_disponible: boolean;
  respuestas: number;
  total_evidencias: number;
  asignaturas: { asignatura: Asignatura; resultado_final: number; escala: string; color_escala: string }[];
}

type TabId = "resultado" | "evidencias" | "ficha";

// ── Colores reutilizados del diseño original ───────────────────────────────
const NAVY = "#1B3A6B";
const NAVY_DARK = "#0F1E3C";
const SLATE = "#5A7295";
const BORDER = "1px solid rgba(27,58,107,0.08)";
const BG_HEADER = "#F8FAFD";
const SERIF = "'Libre Baskerville',serif";
const MONO = "'DM Mono',monospace";

function getStatusColor(escala: string) {
  switch (escala) {
    case "Satisfactorio": return { bg: "#DCFCE7", color: "#15803D" };
    case "Cuasi Satisfactorio": return { bg: "#FEF9C3", color: "#CA8A04" };
    case "Poco Satisfactorio": return { bg: "#FFEDD5", color: "#F97316" };
    default: return { bg: "#FEE2E2", color: "#EF4444" };
  }
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

// ── App principal ────────────────────────────────────────────────────────
export default function App() {
  const [cohortes, setCohortes] = useState<Cohorte[]>([]);
  const [cohorteId, setCohorteId] = useState<number | null>(null);
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [asignaturaId, setAsignaturaId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>("resultado");
  const [loading, setLoading] = useState(true);
  const [resumenCohorte, setResumenCohorte] = useState<ResultadoCohorte | null>(null);
  const [nuevaAsignatura, setNuevaAsignatura] = useState("");
  const [nuevoDocente, setNuevoDocente] = useState("");
  const [creandoAsignatura, setCreandoAsignatura] = useState(false);

  const loadCohortes = useCallback(async () => {
    try {
      const data: Cohorte[] = await apiFetch("/api/cohortes/");
      setCohortes(data);
      if (data.length > 0 && cohorteId === null) setCohorteId(data[0].id);
    } catch (e: any) {
      toast.error(`No se pudo conectar con el backend: ${e.message}`);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAsignaturas = useCallback(async () => {
    if (cohorteId === null) { setAsignaturas([]); return; }
    try {
      const data: Asignatura[] = await apiFetch(`/api/asignaturas/?cohorte=${cohorteId}`);
      setAsignaturas(data);
      if (data.length > 0) {
        setAsignaturaId((prev) => (prev && data.some((a) => a.id === prev) ? prev : data[0].id));
      } else {
        setAsignaturaId(null);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [cohorteId]);

  const loadResumenCohorte = useCallback(async () => {
    if (cohorteId === null) { setResumenCohorte(null); return; }
    try {
      const data: ResultadoCohorte = await apiFetch(`/api/resultado-cohorte/?cohorte=${cohorteId}`);
      setResumenCohorte(data);
    } catch (e: any) {
      // silencioso: el resumen es un plus, no bloquea la vista principal
    }
  }, [cohorteId]);

  useEffect(() => { loadCohortes(); }, [loadCohortes]);
  useEffect(() => { loadAsignaturas(); loadResumenCohorte(); }, [loadAsignaturas, loadResumenCohorte]);

  async function handleCrearAsignatura(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaAsignatura.trim() || cohorteId === null) return;
    setCreandoAsignatura(true);
    try {
      const body = new URLSearchParams({
        nombre: nuevaAsignatura,
        cohorte_id: String(cohorteId),
        docente: nuevoDocente,
      });
      const creada: Asignatura = await apiFetch("/api/asignaturas/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      toast.success(`Asignatura "${creada.nombre}" creada`);
      setNuevaAsignatura("");
      setNuevoDocente("");
      await loadAsignaturas();
      await loadResumenCohorte();
      setAsignaturaId(creada.id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreandoAsignatura(false);
    }
  }

  const asignaturaActual = asignaturas.find((a) => a.id === asignaturaId) ?? null;

  return (
    <div className="h-screen flex flex-col" style={{ background: "#F4F6FA" }}>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div className="flex-shrink-0 px-6 py-3 flex items-center justify-between" style={{ background: "#fff", borderBottom: BORDER }}>
        <div className="flex items-center gap-2">
          <ChevronLeft size={16} style={{ color: SLATE }} />
          <span className="text-xs font-semibold" style={{ color: SLATE }}>Docencia</span>
          <span style={{ color: "#D1D5DB" }}>|</span>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: BG_HEADER, color: NAVY }}>11.2</span>
          <h1 className="text-base font-bold" style={{ fontFamily: SERIF, color: NAVY_DARK }}>Seguimiento de Syllabus</h1>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold" style={{ color: SLATE }}>Cohorte:</label>
          <select
            value={cohorteId ?? ""}
            onChange={(e) => setCohorteId(e.target.value ? Number(e.target.value) : null)}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ border: BORDER, color: NAVY_DARK }}
          >
            <option value="">Seleccionar cohorte</option>
            {cohortes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 px-6 flex gap-1" style={{ background: "#fff", borderBottom: BORDER }}>
        {[
          { id: "resultado" as TabId, label: "Resultados", icon: <BarChart2 size={14} /> },
          { id: "evidencias" as TabId, label: "Evidencias", icon: <FileText size={14} /> },
          { id: "ficha" as TabId, label: "Ficha Técnica", icon: <AlertCircle size={14} /> },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold"
            style={{
              color: tab === t.id ? NAVY : SLATE,
              borderBottom: tab === t.id ? `2px solid ${NAVY}` : "2px solid transparent",
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: SLATE }}>Cargando…</div>
      ) : cohorteId === null ? (
        <EmptyState icon={<TableProperties size={36} />} title="Selecciona o crea una cohorte" subtitle="Usa el selector de arriba." />
      ) : tab === "resultado" ? (
        <TabResultado
          resumenCohorte={resumenCohorte}
          asignaturas={asignaturas}
          asignaturaId={asignaturaId}
          setAsignaturaId={setAsignaturaId}
          asignaturaActual={asignaturaActual}
          nuevaAsignatura={nuevaAsignatura}
          setNuevaAsignatura={setNuevaAsignatura}
          nuevoDocente={nuevoDocente}
          setNuevoDocente={setNuevoDocente}
          creandoAsignatura={creandoAsignatura}
          handleCrearAsignatura={handleCrearAsignatura}
          cohorteActual={cohortes.find((c) => c.id === cohorteId) ?? null}
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Selector simple de asignatura para Evidencias / Ficha Técnica */}
          <div className="px-6 pt-4 pb-2 flex-shrink-0 flex items-center gap-2">
            <label className="text-xs font-semibold" style={{ color: SLATE }}>Asignatura:</label>
            <select
              value={asignaturaId ?? ""}
              onChange={(e) => setAsignaturaId(e.target.value ? Number(e.target.value) : null)}
              className="text-sm px-3 py-1.5 rounded-lg"
              style={{ border: BORDER, color: NAVY_DARK }}
            >
              <option value="">Seleccionar asignatura</option>
              {asignaturas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>

          <div className="flex-1 min-h-0">
            {asignaturaActual === null ? (
              <EmptyState icon={<FileText size={36} />} title="Sin asignaturas" subtitle="Crea una asignatura desde la pestaña Resultados." />
            ) : (
              <>
                {tab === "evidencias" && <TabEvidencias asignatura={asignaturaActual} />}
                {tab === "ficha" && <TabFicha />}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Resultado — 3 columnas: General (izq) · Detalle+Lista (medio) · Radar por asignatura (der) ──
function TabResultado({
  resumenCohorte, asignaturas, asignaturaId, setAsignaturaId, asignaturaActual,
  nuevaAsignatura, setNuevaAsignatura, nuevoDocente, setNuevoDocente,
  creandoAsignatura, handleCrearAsignatura, cohorteActual,
}: {
  resumenCohorte: ResultadoCohorte | null;
  asignaturas: Asignatura[];
  asignaturaId: number | null;
  setAsignaturaId: (id: number | null) => void;
  asignaturaActual: Asignatura | null;
  nuevaAsignatura: string;
  setNuevaAsignatura: (v: string) => void;
  nuevoDocente: string;
  setNuevoDocente: (v: string) => void;
  creandoAsignatura: boolean;
  handleCrearAsignatura: (e: React.FormEvent) => void;
  cohorteActual: Cohorte | null;
}) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="h-full flex px-6 py-4 gap-5 overflow-hidden" style={{ maxWidth: 1500, margin: "0 auto" }}>
      {/* ── Izquierda: tarjeta de contexto + Valoración General + lista ── */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-0">
        <div className="flex-shrink-0 bg-white rounded-2xl px-5 py-4 flex items-center justify-between gap-3" style={{ border: BORDER }}>
          <div className="min-w-0">
            <p className="text-base font-bold truncate" style={{ color: NAVY_DARK }}>{cohorteActual?.nombre || "—"}</p>
            <p className="text-sm mt-1" style={{ color: SLATE }}>Indicador 11.2 · Seguimiento de Syllabus</p>
          </div>
          {asignaturaActual && <ValoracionGeneral asignaturaId={asignaturaActual.id} />}
        </div>

        {/* Formulario para agregar, colapsado detrás de un botón */}
        <div className="flex-shrink-0">
          {showAddForm ? (
            <form onSubmit={(e) => { handleCrearAsignatura(e); setShowAddForm(false); }}
              className="bg-white rounded-2xl p-4 flex flex-wrap items-center gap-2.5" style={{ border: BORDER }}>
              <input value={nuevaAsignatura} onChange={(e) => setNuevaAsignatura(e.target.value)}
                placeholder="Nombre de asignatura" autoFocus
                className="flex-1 min-w-[140px] text-sm px-3 py-2 rounded-lg" style={{ border: BORDER }} />
              <input value={nuevoDocente} onChange={(e) => setNuevoDocente(e.target.value)}
                placeholder="Docente (opcional)"
                className="flex-1 min-w-[120px] text-sm px-3 py-2 rounded-lg" style={{ border: BORDER }} />
              <button type="submit" disabled={creandoAsignatura || !nuevaAsignatura.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50" style={{ background: NAVY }}>
                <Plus size={15} /> Agregar
              </button>
              <button type="button" onClick={() => setShowAddForm(false)}
                className="text-sm font-semibold px-2" style={{ color: SLATE }}>Cancelar</button>
            </form>
          ) : (
            <button onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
              style={{ border: `1px dashed ${SLATE}`, color: SLATE }}>
              <Plus size={15} /> Nueva asignatura
            </button>
          )}
        </div>

        {/* Lista de asignaturas */}
        <div className="flex-1 bg-white rounded-2xl overflow-hidden flex flex-col min-h-0" style={{ border: BORDER }}>
          <div className="px-5 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(27,58,107,0.07)", background: BG_HEADER }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: SLATE }}>Asignaturas</p>
          </div>
          <div className="flex flex-col flex-1 overflow-auto">
            {asignaturas.length === 0 ? (
              <p className="px-5 py-5 text-sm" style={{ color: "#9CA3AF" }}>Aún no hay asignaturas en esta cohorte.</p>
            ) : (
              asignaturas.map((a) => {
                const resumen = resumenCohorte?.asignaturas.find((r) => r.asignatura.id === a.id);
                const active = a.id === asignaturaId;
                const color = resumen ? getStatusColor(resumen.escala).color : "#9CA3AF";
                return (
                  <button key={a.id} onClick={() => setAsignaturaId(a.id)}
                    className="flex-shrink-0 w-full text-left px-4 flex items-center justify-between gap-2 transition-colors hover:bg-blue-50"
                    style={{ height: 48, borderBottom: "1px solid rgba(27,58,107,0.05)", background: active ? "#EEF5FF" : "transparent", borderLeft: `3px solid ${active ? NAVY : "transparent"}` }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <p className="text-sm font-semibold truncate" style={{ color: active ? NAVY : NAVY_DARK }}>{a.nombre}</p>
                    </div>
                    <span className="text-sm font-bold flex-shrink-0" style={{ color, fontFamily: MONO }}>
                      {resumen ? `${resumen.resultado_final}%` : "—"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Derecha: Resultados por EF (radar + grid + Exportar PDF) ── */}
      <div className="flex-1 min-h-0 min-w-0">
        {asignaturaActual ? (
          <ResultadosPorEF asignatura={asignaturaActual} />
        ) : (
          <div className="h-full bg-white rounded-2xl flex items-center justify-center" style={{ border: BORDER }}>
            <p className="text-sm" style={{ color: "#9CA3AF" }}>Selecciona o crea una asignatura.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Badge "Valoración General" (resultado de la asignatura seleccionada) ──
function ValoracionGeneral({ asignaturaId }: { asignaturaId: number }) {
  const [data, setData] = useState<Resultado | null>(null);
  useEffect(() => {
    setData(null);
    apiFetch(`/api/resultado/?asignatura=${asignaturaId}`).then(setData).catch(() => {});
  }, [asignaturaId]);

  if (!data) return <div className="text-right flex-shrink-0"><p className="text-sm" style={{ color: "#9CA3AF" }}>Calculando…</p></div>;
  const sc = getStatusColor(data.escala);
  return (
    <div className="text-right flex-shrink-0">
      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: SLATE }}>Valoración General</p>
      <p className="text-4xl font-bold leading-none" style={{ color: sc.color, fontFamily: MONO }}>{data.resultado_final}%</p>
      <p className="text-sm mt-1.5 font-semibold px-3 py-1 rounded-full inline-block" style={{ background: sc.bg, color: sc.color }}>{data.escala}</p>
    </div>
  );
}

// ── Colores fijos por factor EF (igual que el diseño original de Figma) ──
const EF_COLORS: Record<string, string> = {
  EF1: "#2563EB", // azul
  EF2: "#16A34A", // verde
  EF3: "#0891B2", // cian
  EF4: "#CA8A04", // ámbar
  EF5: "#7C3AED", // morado
};

// ── Celda individual de un EF (grid 2 columnas, estilo Figma) ────────────
function EfCell({ label, code, value }: { label: string; code: string; value: number }) {
  const bc = value >= 75 ? "#16A34A" : value >= 50 ? "#CA8A04" : "#DC2626";
  const factorColor = EF_COLORS[code] || bc;
  return (
    <div className="rounded-xl p-2.5" style={{ background: BG_HEADER, border: "1px solid rgba(27,58,107,0.07)" }}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="font-medium leading-tight" style={{ color: "#4B5563", fontSize: 11 }}>{label}</p>
          <p style={{ color: factorColor, fontFamily: MONO, fontSize: 9 }}>{code}</p>
        </div>
        <span className="font-bold" style={{ color: bc, fontFamily: MONO, fontSize: 14 }}>{value}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "#E5E7EB" }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: bc }} />
      </div>
    </div>
  );
}

// ── Panel derecho completo: "Resultados por EF" (radar + grid + Exportar PDF) ──
function ResultadosPorEF({ asignatura }: { asignatura: Asignatura }) {
  const [data, setData] = useState<Resultado | null>(null);

  useEffect(() => {
    setData(null);
    apiFetch(`/api/resultado/?asignatura=${asignatura.id}`).then(setData).catch(() => {});
  }, [asignatura.id]);

  if (!data) {
    return <div className="h-full bg-white rounded-2xl flex items-center justify-center" style={{ border: BORDER }}>
      <p className="text-xs" style={{ color: "#9CA3AF" }}>Calculando…</p>
    </div>;
  }

  const radarData = [
    { subject: "EF1", score: data.ef1 },
    { subject: "EF2", score: data.ef2 },
    { subject: "EF3", score: data.ef3 },
    { subject: "EF4", score: data.ef4 },
    { subject: "EF5", score: data.ef5 },
  ];
  const efs = [
    { code: "EF1", label: "Seguimiento contenidos", value: data.ef1 },
    { code: "EF2", label: "Mejora micro currículo", value: data.ef2 },
    { code: "EF3", label: "Proceso difundido", value: data.ef3 },
    { code: "EF4", label: "Difusión syllabus EVA", value: data.ef4 },
    { code: "EF5", label: "Normativa institucional", value: data.ef5 },
  ];
  const sc = getStatusColor(data.escala);

  return (
    <div className="h-full bg-white rounded-2xl flex flex-col min-h-0 overflow-hidden" style={{ border: BORDER }}>
      {/* Header de la tarjeta */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(27,58,107,0.07)", background: BG_HEADER }}>
        <div>
          <h3 className="font-bold" style={{ fontFamily: SERIF, color: NAVY_DARK, fontSize: 14 }}>Resultados por EF</h3>
          <p className="text-xs mt-0.5 truncate max-w-52" style={{ color: SLATE }}>{asignatura.nombre}</p>
        </div>
        <span className="px-3 py-1 rounded-lg font-bold flex-shrink-0" style={{ background: sc.bg, color: sc.color, fontFamily: MONO, fontSize: 14 }}>
          {data.resultado_final}%
        </span>
      </div>

      {/* Radar */}
      <div className="flex-shrink-0 px-5 pt-3" style={{ height: 185 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="#E5E7EB" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: SLATE, fontSize: 11, fontWeight: 700, fontFamily: MONO }} />
            <Radar dataKey="score" stroke="#16A34A" fill="#16A34A" fillOpacity={0.15} strokeWidth={2} dot={{ r: 4, fill: "#16A34A" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Grid de EF */}
      <div className="flex-1 px-5 pb-2 flex flex-col gap-1.5 min-h-0">
        <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
          <EfCell code={efs[0].code} label={efs[0].label} value={efs[0].value} />
          <EfCell code={efs[1].code} label={efs[1].label} value={efs[1].value} />
        </div>
        <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
          <EfCell code={efs[2].code} label={efs[2].label} value={efs[2].value} />
          <EfCell code={efs[3].code} label={efs[3].label} value={efs[3].value} />
        </div>
        <EfCell code={efs[4].code} label={efs[4].label} value={efs[4].value} />

        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <AlertCircle size={10} style={{ color: "#94A3B8", flexShrink: 0 }} />
          <p style={{ color: "#94A3B8", fontSize: 10 }}>
            {data.ef_disponible
              ? `Calculado con ${data.respuestas} respuesta(s) de encuesta y ${data.total_evidencias}/3 evidencias.`
              : "Sin respuestas de encuesta aún; basado en evidencias y normativa."}
          </p>
        </div>
      </div>

      {/* Exportar PDF */}
      <div className="flex justify-end px-5 py-2.5 flex-shrink-0" style={{ borderTop: "1px solid rgba(27,58,107,0.07)" }}>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all hover:opacity-90 active:scale-95"
          style={{ background: NAVY, color: "#fff", fontSize: 12 }}>
          <Download size={12} /> Exportar PDF
        </button>
      </div>
    </div>
  );
}

// ── Tab: Evidencias (diseño original de Figma: fuentes + vista previa) ────
const TIPOS: { value: Evidencia["tipo"]; label: string }[] = [
  { value: "malla", label: "Malla Curricular" },
  { value: "syllabus", label: "Syllabus" },
  { value: "acta", label: "Acta de Retroalimentación" },
];

function TabEvidencias({ asignatura }: { asignatura: Asignatura }) {
  const [lista, setLista] = useState<Evidencia[]>([]);
  const [selected, setSelected] = useState<Evidencia["tipo"] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = { current: null as HTMLInputElement | null };

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/evidencias/?asignatura=${asignatura.id}`);
      setLista(data.evidencias);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [asignatura.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(null); }, [asignatura.id]);

  const evidenciaDe = (tipo: Evidencia["tipo"]) => lista.find((ev) => ev.tipo === tipo) ?? null;
  const selectedEvidencia = selected ? evidenciaDe(selected) : null;
  const cargadas = lista.length;

  async function handleFileChosen(file: File) {
    const tipoDestino = selected ?? TIPOS.find((t) => !evidenciaDe(t.value))?.value ?? TIPOS[0].value;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("tipo", tipoDestino);
      form.append("asignatura_id", String(asignatura.id));
      form.append("archivo", file);
      await fetch(`${API_BASE}/api/evidencias/`, { method: "POST", body: form }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Error al subir");
      });
      toast.success("Evidencia subida correctamente");
      setSelected(tipoDestino);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="h-full flex px-6 py-4 max-w-5xl mx-auto gap-4 overflow-hidden">
      {/* Izquierda: lista de fuentes */}
      <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden gap-2">
        <div className="bg-white rounded-2xl overflow-hidden flex-1 flex flex-col" style={{ border: BORDER }}>
          <div className="px-4 py-3 flex-shrink-0 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(27,58,107,0.07)", background: BG_HEADER }}>
            <div>
              <h3 className="text-xs font-bold" style={{ fontFamily: SERIF, color: NAVY_DARK }}>Fuentes de información</h3>
              <p className="text-xs mt-0.5" style={{ color: SLATE }}>{cargadas}/{TIPOS.length} cargadas</p>
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: SLATE }}>Estado</span>
          </div>
          <div className="flex-1 overflow-auto divide-y" style={{ borderColor: "rgba(27,58,107,0.06)" }}>
            {TIPOS.map((t, i) => {
              const ev = evidenciaDe(t.value);
              const active = selected === t.value;
              return (
                <button key={t.value}
                  onClick={() => setSelected(t.value)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-blue-50"
                  style={{ background: active ? "#EEF2F7" : "transparent", borderLeft: active ? `3px solid ${NAVY}` : "3px solid transparent" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: ev ? "#DCFCE7" : "#F3F4F6" }}>
                    {ev
                      ? <CheckCircle2 size={14} style={{ color: "#16A34A" }} />
                      : <FileText size={14} style={{ color: "#9CA3AF" }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: active ? NAVY : NAVY_DARK }}>{t.label}</p>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>Fuente {i + 1}</p>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 whitespace-nowrap"
                    style={ev ? { background: "#DCFCE7", color: "#16A34A" } : { background: "#FEF9C3", color: "#CA8A04" }}>
                    {ev ? "Cargado ✓" : "Pendiente"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <input
          ref={(el) => { fileInputRef.current = el; }}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChosen(f); e.target.value = ""; }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: NAVY, color: "#fff" }}>
          <Upload size={12} /> {uploading ? "Subiendo…" : "Cargar evidencias"}
        </button>
      </div>

      {/* Derecha: vista previa */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-2xl" style={{ border: BORDER }}>
        <div className="px-5 py-3 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(27,58,107,0.07)", background: BG_HEADER }}>
          <div>
            <h3 className="text-xs font-bold" style={{ color: NAVY_DARK }}>
              {selected ? TIPOS.find((t) => t.value === selected)?.label : "Vista previa"}
            </h3>
            {selectedEvidencia && (
              <p className="text-xs mt-0.5 font-mono" style={{ color: SLATE }}>{selectedEvidencia.archivo_nombre}</p>
            )}
          </div>
          {selectedEvidencia && (
            <a href={selectedEvidencia.archivo_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90"
              style={{ background: NAVY, color: "#fff" }}>
              <ExternalLink size={11} /> Abrir documento
            </a>
          )}
        </div>
        <div className="flex-1 overflow-hidden flex items-center justify-center min-h-0">
          {selectedEvidencia ? (
            <iframe
              src={selectedEvidencia.archivo_url}
              className="w-full h-full"
              title={selectedEvidencia.archivo_nombre}
              style={{ border: "none" }}
            />
          ) : selected ? (
            <div className="text-center px-8">
              <AlertCircle size={40} className="mx-auto mb-3" style={{ color: "#D1D5DB" }} />
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>Sin documento cargado</p>
              <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                Esta fuente aún no tiene archivo. Use "Cargar evidencias" desde el panel izquierdo.
              </p>
            </div>
          ) : (
            <div className="text-center px-8">
              <FolderOpen size={40} className="mx-auto mb-3" style={{ color: "#D1D5DB" }} />
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>Seleccione una fuente</p>
              <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>Haga clic en una fuente de la lista para ver su vista previa.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Ficha técnica (diseño original de Figma, datos del indicador 11.2) ──
const FICHA_11_2 = {
  name: "Seguimiento de Syllabus",
  code: "11.2",
  description: "Verifica el cumplimiento y seguimiento efectivo de los sílabos durante el período académico a través de registros documentados y actas de revisión periódica.",
  formula: "(Asignaturas con seguimiento documentado / Total de asignaturas) × 100",
  period: "Período académico vigente",
  purpose: "Asegurar que los docentes cumplen con la planificación del sílabo y que existen mecanismos formales de control y revisión del avance curricular en cada asignatura.",
  slots: [
    { label: "Sílabos" },
    { label: "Seguimiento de syllabus" },
    { label: "Actas de revisión" },
  ],
};

function TabFicha() {
  const scale = [
    { label: "Satisfactorio", range: "≥ 75%", color: "#16A34A", bg: "#DCFCE7" },
    { label: "Cuasi Satisfactorio", range: "50–74%", color: "#CA8A04", bg: "#FEF9C3" },
    { label: "Poco Satisfactorio", range: "25–49%", color: "#EA580C", bg: "#FFEDD5" },
    { label: "Deficiente", range: "< 25%", color: "#DC2626", bg: "#FEE2E2" },
  ];
  const ind = FICHA_11_2;

  return (
    <div className="h-full flex flex-col px-6 py-4 max-w-6xl mx-auto overflow-hidden gap-3">
      {/* Título + fórmula */}
      <div className="flex-shrink-0 rounded-2xl px-6 py-4"
        style={{ background: "linear-gradient(135deg,#0F2556,#1B3A6B)", color: "#fff" }}>
        <h2 className="text-xl font-bold" style={{ fontFamily: SERIF }}>{ind.name}</h2>
        <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-xl" style={{ background: "rgba(255,255,255,0.12)" }}>
          <span className="text-xs text-blue-300 font-semibold">Fórmula:</span>
          <span className="text-sm font-semibold" style={{ fontFamily: MONO }}>{ind.formula}</span>
        </div>
      </div>

      {/* 3 columnas */}
      <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">
        {/* Col 1: Descripción */}
        <div className="flex-1 bg-white rounded-2xl p-5 overflow-hidden" style={{ border: BORDER }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: SLATE }}>Descripción</p>
          <p className="text-sm leading-relaxed" style={{ color: "#1F2937" }}>{ind.description}</p>
        </div>

        {/* Col 2: Para qué sirve */}
        <div className="flex-1 bg-white rounded-2xl p-5 overflow-hidden" style={{ border: BORDER }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: SLATE }}>Para qué sirve</p>
          <p className="text-sm leading-relaxed" style={{ color: "#1F2937" }}>{ind.purpose}</p>
        </div>

        {/* Col 3: Tipo + Escala */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="flex-shrink-0 bg-white rounded-2xl px-4 py-3" style={{ border: BORDER }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: SLATE }}>Tipo de indicador</p>
            <span className="inline-block px-3 py-1 rounded-full text-sm font-bold" style={{ background: "#EDE9FE", color: "#7C3AED" }}>
              Cualitativo
            </span>
          </div>
          <div className="flex-1 bg-white rounded-2xl px-4 py-3 flex flex-col min-h-0" style={{ border: BORDER }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2 flex-shrink-0" style={{ color: SLATE }}>Escala de calificación</p>
            <div className="flex flex-col flex-1 gap-1.5 justify-around">
              {scale.map((sc) => (
                <div key={sc.label} className="rounded-xl px-3 py-2 flex items-center gap-2.5"
                  style={{ background: sc.bg, border: `1.5px solid ${sc.color}30` }}>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: sc.color }} />
                  <div className="flex items-center justify-between flex-1">
                    <p className="text-xs font-bold" style={{ color: sc.color }}>{sc.label}</p>
                    <p className="text-xs font-mono" style={{ color: sc.color, opacity: 0.75 }}>{sc.range}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Franja de metadatos */}
      <div className="bg-white rounded-2xl px-5 py-3 flex-shrink-0 flex items-center gap-5 flex-wrap" style={{ border: BORDER }}>
        {[
          { label: "Período", value: ind.period },
          { label: "Fuentes", value: `${ind.slots.length} documentos PDF` },
          { label: "Indicador", value: ind.code },
        ].map((m) => (
          <div key={m.label} className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: SLATE }}>{m.label}:</span>
            <span className="text-xs px-2 py-0.5 rounded-md font-semibold" style={{ background: "#EEF2F7", color: "#1B3A6B" }}>{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="mb-3" style={{ color: "#D1D5DB" }}>{icon}</div>
      <p className="text-sm font-medium" style={{ color: "#6B7280" }}>{title}</p>
      <p className="text-xs mt-1 max-w-xs" style={{ color: "#9CA3AF" }}>{subtitle}</p>
    </div>
  );
}
