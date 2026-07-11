import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload, CheckCircle2, FileText, TableProperties,
  ExternalLink, AlertCircle, BarChart2, Plus, ChevronLeft, FolderOpen, Download, Loader2, Info,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN: cambia esto según dónde corra tu Django.
// ─────────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8000";

// ── Tipos que vienen de la API (coinciden con tus serializers de Django) ──
interface Cohorte { id: number; nombre: string; activo: boolean; }

interface PeriodoAcademico {
  id: number;
  cohorte: number;
  nombre: string;
  orden: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

interface Asignatura { id: number; periodo_academico: number; nombre: string; docente: string; }

interface Evidencia {
  id: number;
  asignatura: number | null;
  periodo_academico: number | null;
  carrera: number | null;
  tipo: "malla_curricular" | "syllabus" | "acta_retroalimentacion" | "acta_ajuste_curricular" | "evidencia_difusion" | "reglamento_normativa";
  tipo_display: string;
  archivo_url: string;
  archivo_nombre: string;
  subido_por: string;
  fecha_subida: string;
  vigente: boolean;
}

interface Resultado {
  asignatura: Asignatura;
  resultado_final: number | null;
  valoracion_general: number | null;
  estado_general: "completo" | "parcial" | "sin_datos";
  escala: string | null;
  color_escala: string | null;
  evidencias_info: Record<string, { subida: boolean; label: string }>;
  total_evidencias: number;
  pct_evidencias: number;
  ef_disponible: boolean;
  ef1: number | null; ef1_estado: "ok" | "sin_datos";
  ef2: number | null; ef2_estado: "ok" | "sin_datos";
  ef3: number | null; ef3_estado: "ok" | "sin_datos";
  ef4: number | null; ef4_estado: "ok" | "sin_datos";
  ef5: number | null; ef5_estado: "ok" | "sin_datos";
  ef_puntaje: number | null;
  respuestas: number;
  promedio_general: number;
}

interface ResultadoCohorte {
  cohorte: Cohorte;
  periodo?: PeriodoAcademico | null;
  resultado_final: number | null;
  valoracion_general: number | null;
  estado_general: "completo" | "parcial" | "sin_datos";
  escala: string | null;
  color_escala: string | null;
  ef1: number | null; ef1_estado: "ok" | "sin_datos";
  ef2: number | null; ef2_estado: "ok" | "sin_datos";
  ef3: number | null; ef3_estado: "ok" | "sin_datos";
  ef4: number | null; ef4_estado: "ok" | "sin_datos";
  ef5: number | null; ef5_estado: "ok" | "sin_datos";
  ef_disponible: boolean;
  respuestas: number;
  total_evidencias: number;
  asignaturas: { asignatura: Asignatura; resultado_final: number | null; escala: string | null; color_escala: string | null }[];
}

interface EncuestaDetallePregunta {
  numero: number;
  texto: string | null;
  es_ef1: boolean;
  es_ef4: boolean;
  conteos: Record<string, number>;
  total: number;
}

interface EncuestaDetalle {
  asignatura: number;
  materia_filtrada: string | null;
  respuestas_totales_materia: number;
  preguntas: EncuestaDetallePregunta[];
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

function getStatusColor(escala: string | null) {
  if (!escala) return { bg: "#EEF2F7", color: "#64748B" };
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
  const [periodos, setPeriodos] = useState<PeriodoAcademico[]>([]);
  const [periodoId, setPeriodoId] = useState<number | null>(null);
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [asignaturaId, setAsignaturaId] = useState<number | null>(null);
  const [resultadoRefreshToken, setResultadoRefreshToken] = useState(0);
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
      setCohorteId((prev) => {
        if (prev !== null && data.some((c) => c.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (e: any) {
      toast.error(`No se pudo conectar con el backend: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCohorteChange = useCallback((value: string) => {
    const nextCohorteId = value ? Number(value) : null;
    setCohorteId(nextCohorteId);
    setPeriodoId(null);
    setPeriodos([]);
    setAsignaturas([]);
    setAsignaturaId(null);
    setResumenCohorte(null);
  }, []);

  const handlePeriodoChange = useCallback((value: string) => {
    const nextPeriodoId = value ? Number(value) : null;
    setPeriodoId(nextPeriodoId);
    setAsignaturas([]);
    setAsignaturaId(null);
    setResumenCohorte(null);
  }, []);

  const loadPeriodos = useCallback(async () => {
    if (cohorteId === null) {
      setPeriodos([]);
      setPeriodoId(null);
      return;
    }
    try {
      const data: PeriodoAcademico[] = await apiFetch(`/api/periodos/?cohorte=${cohorteId}`);
      setPeriodos(data);
      setPeriodoId((prev) => {
        if (prev !== null && data.some((p) => p.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (e: any) {
      toast.error(e.message);
      setPeriodos([]);
      setPeriodoId(null);
    }
  }, [cohorteId]);

  const loadAsignaturas = useCallback(async () => {
    if (periodoId === null) { setAsignaturas([]); return; }
    try {
      const data: Asignatura[] = await apiFetch(`/api/asignaturas/?periodo=${periodoId}`);
      setAsignaturas(data);
      if (data.length > 0) {
        setAsignaturaId((prev) => (prev && data.some((a) => a.id === prev) ? prev : data[0].id));
      } else {
        setAsignaturaId(null);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [periodoId]);

  const loadResumenCohorte = useCallback(async () => {
    if (cohorteId === null || periodoId === null) { setResumenCohorte(null); return; }
    try {
      const data: ResultadoCohorte = await apiFetch(`/api/resultado-cohorte/?cohorte=${cohorteId}&periodo=${periodoId}`);
      setResumenCohorte(data);
    } catch (e: any) {
      // silencioso: el resumen es un plus, no bloquea la vista principal
    }
  }, [cohorteId, periodoId]);

  const handleEvidenceUploaded = useCallback(async () => {
    setResultadoRefreshToken((current) => current + 1);
    await loadResumenCohorte();
  }, [loadResumenCohorte]);

  useEffect(() => { loadCohortes(); }, [loadCohortes]);
  useEffect(() => { loadPeriodos(); }, [loadPeriodos]);
  useEffect(() => { loadAsignaturas(); loadResumenCohorte(); }, [loadAsignaturas, loadResumenCohorte]);

  async function handleCrearAsignatura(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaAsignatura.trim() || periodoId === null) return;
    setCreandoAsignatura(true);
    try {
      const body = new URLSearchParams({
        nombre: nuevaAsignatura,
        periodo_id: String(periodoId),
        cohorte_id: String(cohorteId ?? ""),
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
  const periodoActual = periodos.find((p) => p.id === periodoId) ?? null;

  return (
    <div className="h-screen flex flex-col" style={{ background: "#F4F6FA" }}>
      <Toaster position="top-right" richColors />

      {/* Barra Cohorte/PAO */}
      <div className="flex-shrink-0 px-6 py-3 flex items-center justify-between gap-4" style={{ background: "#fff", borderBottom: BORDER }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: SLATE }}>Contexto</span>
          <span style={{ color: "#D1D5DB" }}>|</span>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: BG_HEADER, color: NAVY }}>11.2</span>
          <h1 className="text-base font-bold" style={{ fontFamily: SERIF, color: NAVY_DARK }}>Seguimiento de Syllabus</h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold" style={{ color: SLATE }}>Cohorte:</label>
            <Select value={cohorteId !== null ? String(cohorteId) : ""} onValueChange={handleCohorteChange}>
              <SelectTrigger className="w-[220px] rounded-xl" style={{ border: BORDER, color: NAVY_DARK, background: "#fff" }}>
                <SelectValue placeholder="Seleccionar cohorte" />
              </SelectTrigger>
              <SelectContent>
                {cohortes.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold" style={{ color: SLATE }}>PAO:</label>
            <Select
              value={periodoId !== null ? String(periodoId) : ""}
              onValueChange={handlePeriodoChange}
              disabled={cohorteId === null || periodos.length === 0}
            >
              <SelectTrigger className="w-[200px] rounded-xl" style={{ border: BORDER, color: NAVY_DARK, background: "#fff" }}>
                <SelectValue placeholder={cohorteId === null ? "Selecciona cohorte" : "Seleccionar PAO"} />
              </SelectTrigger>
              <SelectContent>
                {periodos.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 px-6 py-3 flex items-center justify-between" style={{ background: "#fff", borderBottom: BORDER }}>
        <div className="flex items-center gap-2">
          <ChevronLeft size={16} style={{ color: SLATE }} />
          <span className="text-xs font-semibold" style={{ color: SLATE }}>Docencia</span>
          <span style={{ color: "#D1D5DB" }}>|</span>
          <span className="text-xs text-white font-semibold px-2 py-0.5 rounded" style={{ background: NAVY }}>PAO {periodoActual?.nombre ?? "—"}</span>
          <p className="text-sm font-bold" style={{ fontFamily: SERIF, color: NAVY_DARK }}>{cohorteActualLabel(cohortes, cohorteId)}</p>
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
      ) : (
        <>
          {/* "Resultados" se mantiene SIEMPRE montado (solo se oculta con CSS
              vía display:none) mientras haya una cohorte seleccionada. Antes se
              montaba/desmontaba por completo cada vez que se cambiaba de pestaña
              y se volvía a esta — eso forzaba a recharts a re-medir el radar de
              cero al volver, lo que se veía como que el gráfico "se encoge" al
              regresar a Resultados. Ahora el componente (y el radar) nunca se
              desmonta por cambiar de pestaña, solo por cambiar de cohorte. */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ display: tab === "resultado" ? "flex" : "none" }}>
            <TabResultado
              resumenCohorte={resumenCohorte}
              asignaturas={asignaturas}
              asignaturaId={asignaturaId}
              setAsignaturaId={setAsignaturaId}
              asignaturaActual={asignaturaActual}
              refreshToken={resultadoRefreshToken}
              periodoActual={periodoActual}
              nuevaAsignatura={nuevaAsignatura}
              setNuevaAsignatura={setNuevaAsignatura}
              nuevoDocente={nuevoDocente}
              setNuevoDocente={setNuevoDocente}
              creandoAsignatura={creandoAsignatura}
              handleCrearAsignatura={handleCrearAsignatura}
              cohorteActual={cohortes.find((c) => c.id === cohorteId) ?? null}
            />
          </div>

          {(tab === "evidencias" || tab === "ficha") && (
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
                    {tab === "evidencias" && <TabEvidencias asignatura={asignaturaActual} onEvidenceUploaded={handleEvidenceUploaded} />}
                    {tab === "ficha" && <TabFicha />}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function cohorteActualLabel(cohortes: Cohorte[], cohorteId: number | null) {
  return cohortes.find((c) => c.id === cohorteId)?.nombre || "—";
}

// ── Tab: Resultado — 3 columnas: General (izq) · Detalle+Lista (medio) · Radar por asignatura (der) ──
function TabResultado({
  resumenCohorte, asignaturas, asignaturaId, setAsignaturaId, asignaturaActual, refreshToken, periodoActual,
  nuevaAsignatura, setNuevaAsignatura, nuevoDocente, setNuevoDocente,
  creandoAsignatura, handleCrearAsignatura, cohorteActual,
}: {
  resumenCohorte: ResultadoCohorte | null;
  asignaturas: Asignatura[];
  asignaturaId: number | null;
  setAsignaturaId: (id: number | null) => void;
  asignaturaActual: Asignatura | null;
  refreshToken: number;
  periodoActual: PeriodoAcademico | null;
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
    <div className="h-full flex px-6 py-4 gap-5 overflow-hidden" style={{ maxWidth: 1152, margin: "0 auto" }}>
      {/* ── Izquierda: tarjeta de contexto + Valoración General + lista ── */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-0">
        <div className="flex-shrink-0 bg-white rounded-2xl px-5 py-4 flex items-center justify-between gap-3" style={{ border: BORDER }}>
          <div className="min-w-0">
            <p className="text-base font-bold truncate" style={{ color: NAVY_DARK }}>Desarrollo de Software</p>
            <p className="text-sm mt-1" style={{ color: SLATE }}>
              {cohorteActual?.nombre || "—"} · <span className="whitespace-nowrap">{periodoActual?.nombre || "PAO"}</span> · {asignaturas.length} {asignaturas.length === 1 ? "asignatura" : "asignaturas"}
            </p>
          </div>
          {resumenCohorte ? <ValoracionGeneral resumen={resumenCohorte} /> : <ValoracionGeneralCargando />}
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
                      {resumen?.resultado_final ?? "—"}{resumen?.resultado_final !== null && resumen?.resultado_final !== undefined ? "%" : ""}
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
          <ResultadosPorEF
            asignatura={asignaturaActual}
            refreshToken={refreshToken}
            cohorteActual={cohorteActual}
            periodoActual={periodoActual}
          />
        ) : (
          <div className="h-full bg-white rounded-2xl flex items-center justify-center" style={{ border: BORDER }}>
            <p className="text-sm" style={{ color: "#9CA3AF" }}>Selecciona o crea una asignatura.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ValoracionGeneralCargando() {
  return (
    <div className="text-right flex-shrink-0">
      <p className="text-sm" style={{ color: "#9CA3AF" }}>Calculando…</p>
    </div>
  );
}

// ── Badge "Valoración General" (resumen agregado del PAO/cohorte) ──
function ValoracionGeneral({ resumen }: { resumen: ResultadoCohorte }) {
  const sc = getStatusColor(resumen.escala);
  const faltantes = [
    resumen.ef2_estado === "sin_datos" ? "EF2" : null,
    resumen.ef3_estado === "sin_datos" ? "EF3" : null,
    resumen.ef5_estado === "sin_datos" ? "EF5" : null,
  ].filter(Boolean) as string[];
  return (
    <div className="text-right flex-shrink-0 max-w-[240px]">
      <div className="flex items-center justify-end gap-1 mb-1">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: SLATE }}>Valoración General</p>
        <span
          title="Estimación interna — el resultado oficial lo determina el Comité de Evaluación Externo de CACES"
          className="inline-flex cursor-help">
          <Info size={13} style={{ color: SLATE }} />
        </span>
      </div>
      {resumen.resultado_final === null ? (
        <div className="inline-flex flex-col items-end gap-1">
          <p className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "#64748B", fontFamily: SERIF }}>Sin datos</p>
          <p className="text-xs font-semibold" style={{ color: "#94A3B8" }}>No hay asignaturas para calcular</p>
        </div>
      ) : (
        <>
          <p className="text-4xl font-bold leading-none" style={{ color: sc.color, fontFamily: MONO }}>{resumen.resultado_final}%</p>
          <p className="text-sm mt-1.5 font-semibold px-3 py-1 rounded-full inline-block" style={{ background: sc.bg, color: sc.color }}>{resumen.escala}</p>
          {resumen.estado_general !== "completo" && (
            <p className="text-xs font-semibold mt-1" style={{ color: "#94A3B8" }}>
              Parcial{faltantes.length ? ` — falta evidencia de ${faltantes.join(", ")}` : ""}
            </p>
          )}
        </>
      )}
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
function EfCell({ label, code, value, status }: { label: string; code: string; value: number | null; status: "ok" | "sin_datos" }) {
  const numericValue = value ?? 0;
  const bc = status === "sin_datos" ? "#CBD5E1" : numericValue >= 75 ? "#16A34A" : numericValue >= 50 ? "#CA8A04" : "#DC2626";
  const factorColor = status === "sin_datos" ? "#94A3B8" : EF_COLORS[code] || bc;
  return (
    <div className="rounded-xl p-2.5" style={{ background: BG_HEADER, border: "1px solid rgba(27,58,107,0.07)" }}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="font-medium leading-tight" style={{ color: "#4B5563", fontSize: 11 }}>{label}</p>
          <p style={{ color: factorColor, fontFamily: MONO, fontSize: 9 }}>{code}</p>
        </div>
        <span className="font-bold" style={{ color: bc, fontFamily: MONO, fontSize: 14 }}>{status === "sin_datos" ? "Sin datos" : `${numericValue}%`}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "#E5E7EB" }}>
        <div className="h-full rounded-full" style={{ width: status === "sin_datos" ? "0%" : `${numericValue}%`, background: bc }} />
      </div>
    </div>
  );
}

// ── Panel derecho completo: "Resultados por EF" (radar + grid + Exportar PDF) ──
function ResultadosPorEF({
  asignatura, refreshToken, cohorteActual, periodoActual,
}: {
  asignatura: Asignatura;
  refreshToken: number;
  cohorteActual: Cohorte | null;
  periodoActual: PeriodoAcademico | null;
}) {
  const [data, setData] = useState<Resultado | null>(null);
  const [loadingResultado, setLoadingResultado] = useState(true);
  const [exportando, setExportando] = useState(false);
  const radarRef = useRef<HTMLDivElement>(null);
  const [radarWidth, setRadarWidth] = useState(0);
  const radarResizeObserver = useRef<ResizeObserver | null>(null);

  // Ref callback (NO useLayoutEffect con deps []) para medir el ancho del
  // radar. Motivo: mientras `data` es null se muestra el placeholder
  // "Calculando…" en vez del radar, así que el div a medir no existe todavía
  // en el primer render. Un useLayoutEffect con `[]` corre una sola vez, justo
  // en ese primer render donde el div aún no existe, y nunca se reintenta
  // cuando el radar por fin aparece — eso hacía que el gráfico se quedara con
  // ancho 0 (invisible) para siempre. La ref callback, en cambio, se ejecuta
  // cada vez que el nodo se monta o desmonta, así que mide correctamente sin
  // importar en qué render aparece el div.
  const radarBoxRef = useCallback((el: HTMLDivElement | null) => {
    if (radarResizeObserver.current) {
      radarResizeObserver.current.disconnect();
      radarResizeObserver.current = null;
    }
    if (el) {
      const medir = () => setRadarWidth(el.clientWidth);
      medir();
      radarResizeObserver.current = new ResizeObserver(medir);
      radarResizeObserver.current.observe(el);
    }
  }, []);

  useEffect(() => {
    // Importante: NO se hace `setData(null)` acá. Antes, cada clic en una
    // asignatura vaciaba los datos y forzaba a React a destruir por completo
    // el contenedor del radar (recharts) y volver a crearlo cuando llegaban
    // los datos nuevos — ese remount hacía que ResponsiveContainer tuviera
    // que re-medir su tamaño de forma asíncrona, lo que se veía como que el
    // gráfico "se encoge" apenas termina de cargar. Ahora se conservan los
    // datos de la asignatura anterior visibles (atenuados) hasta que llegan
    // los nuevos, así el gráfico nunca se desmonta entre clics.
    setLoadingResultado(true);
    apiFetch(`/api/resultado/?asignatura=${asignatura.id}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoadingResultado(false));
  }, [asignatura.id, refreshToken]);

  async function handleExportarPDF() {
    if (!data) return;
    setExportando(true);
    try {
      // jsPDF y html2canvas pesan ~300-400kB juntos y solo se usan acá (Exportar
      // PDF de la Entrega 3). Se cargan de forma dinámica (code-splitting) para
      // que NO formen parte del bundle inicial que descarga cualquier usuario
      // con solo abrir la página — antes se importaban de forma estática al
      // inicio del archivo y viajaban en cada carga, aunque nunca se exportara.
      const [{ default: jsPDF }, { default: html2canvas }, evidenciasRes, encuestaDetalle] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
        apiFetch(`/api/evidencias/?asignatura=${asignatura.id}`) as Promise<{ total: number; evidencias: Evidencia[] }>,
        apiFetch(`/api/encuesta-detalle/?asignatura=${asignatura.id}`) as Promise<EncuestaDetalle>,
      ]);

      let radarImg: string | null = null;
      let radarAspect = 1;
      if (radarRef.current) {
        const rect = radarRef.current.getBoundingClientRect();
        // El contenedor ocupa el 100% del ancho del panel, pero recharts dibuja
        // el círculo del radar centrado y acotado por la altura (más angosta).
        // Se recorta solo ese cuadrado central para no capturar el espacio en
        // blanco de los costados (que antes hacía ver el radar chico y ancho).
        const lado = rect.height;
        const offsetX = Math.max(0, (rect.width - lado) / 2);
        const canvas = await html2canvas(radarRef.current, {
          backgroundColor: "#ffffff",
          scale: 2,
          x: offsetX,
          y: 0,
          width: lado,
          height: rect.height,
        });
        radarImg = canvas.toDataURL("image/png");
        radarAspect = canvas.width / canvas.height;
      }

      generarPdfAsignatura(jsPDF, {
        asignatura,
        cohorteActual,
        periodoActual,
        resultado: data,
        radarImg,
        radarAspect,
        evidencias: evidenciasRes.evidencias,
        encuestaDetalle,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el PDF.");
    } finally {
      setExportando(false);
    }
  }

  if (!data) {
    return <div className="h-full bg-white rounded-2xl flex items-center justify-center" style={{ border: BORDER }}>
      <p className="text-xs" style={{ color: "#9CA3AF" }}>Calculando…</p>
    </div>;
  }

  const radarData = [
    { subject: "EF1", score: data.ef1 ?? 0 },
    { subject: "EF2", score: data.ef2 ?? 0 },
    { subject: "EF3", score: data.ef3 ?? 0 },
    { subject: "EF4", score: data.ef4 ?? 0 },
    { subject: "EF5", score: data.ef5 ?? 0 },
  ];
  const efs = [
    { code: "EF1", label: "Seguimiento contenidos", value: data.ef1, status: data.ef1_estado },
    { code: "EF2", label: "Mejora micro currículo", value: data.ef2, status: data.ef2_estado },
    { code: "EF3", label: "Proceso difundido", value: data.ef3, status: data.ef3_estado },
    { code: "EF4", label: "Difusión syllabus EVA", value: data.ef4, status: data.ef4_estado },
    { code: "EF5", label: "Normativa institucional", value: data.ef5, status: data.ef5_estado },
  ];
  const sc = getStatusColor(data.escala);

  return (
    <div className="h-full bg-white rounded-2xl flex flex-col min-h-0 overflow-hidden"
      style={{ border: BORDER, opacity: loadingResultado ? 0.55 : 1, transition: "opacity 150ms ease" }}>
      {/* Header de la tarjeta */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(27,58,107,0.07)", background: BG_HEADER }}>
        <div>
          <h3 className="font-bold" style={{ fontFamily: SERIF, color: NAVY_DARK, fontSize: 14 }}>Resultados por EF</h3>
          <p className="text-xs mt-0.5 truncate max-w-52" style={{ color: SLATE }}>{asignatura.nombre}</p>
        </div>
        <span className="px-3 py-1 rounded-lg font-bold flex-shrink-0" style={{ background: sc.bg, color: sc.color, fontFamily: MONO, fontSize: 14 }}>
          {data.resultado_final === null ? "Sin datos" : `${data.resultado_final}%${data.estado_general !== "completo" ? " (parcial)" : ""}`}
        </span>
      </div>

      {/* Radar */}
      <div ref={radarRef} className="flex-shrink-0 px-5 pt-3" style={{ height: 185, background: "#fff" }}>
        <div ref={radarBoxRef} style={{ width: "100%", height: "100%" }}>
          {radarWidth > 0 && (
            <RadarChart width={radarWidth} height={185} data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="#E5E7EB" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: SLATE, fontSize: 11, fontWeight: 700, fontFamily: MONO }} />
              <Radar dataKey="score" stroke="#16A34A" fill="#16A34A" fillOpacity={0.15} strokeWidth={2} dot={{ r: 4, fill: "#16A34A" }} />
            </RadarChart>
          )}
        </div>
      </div>

      {/* Grid de EF */}
      <div className="flex-1 px-5 pb-2 flex flex-col gap-1.5 min-h-0">
        <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
          <EfCell code={efs[0].code} label={efs[0].label} value={efs[0].value} status={efs[0].status} />
          <EfCell code={efs[1].code} label={efs[1].label} value={efs[1].value} status={efs[1].status} />
        </div>
        <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
          <EfCell code={efs[2].code} label={efs[2].label} value={efs[2].value} status={efs[2].status} />
          <EfCell code={efs[3].code} label={efs[3].label} value={efs[3].value} status={efs[3].status} />
        </div>
        <EfCell code={efs[4].code} label={efs[4].label} value={efs[4].value} status={efs[4].status} />

        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <AlertCircle size={10} style={{ color: "#94A3B8", flexShrink: 0 }} />
          <p style={{ color: "#94A3B8", fontSize: 10 }}>
            EF1 y EF4: encuesta de heteroevaluación · EF2, EF3 y EF5: evidencia documental
          </p>
        </div>
      </div>

      {/* Exportar PDF */}
      <div className="flex justify-end px-5 py-2.5 flex-shrink-0" style={{ borderTop: "1px solid rgba(27,58,107,0.07)" }}>
        <button
          onClick={handleExportarPDF}
          disabled={exportando}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
          style={{ background: NAVY, color: "#fff", fontSize: 12 }}>
          {exportando
            ? <><Loader2 size={12} className="animate-spin" /> Generando…</>
            : <><Download size={12} /> Exportar PDF</>}
        </button>
      </div>
    </div>
  );
}

// ── Generación del PDF de la Entrega 3 (jsPDF + html2canvas) ──────────────
// Nota de diseño: jsPDF no permite embeber "Libre Baskerville"/"DM Mono" sin
// cargar los archivos de fuente como base64 (peso extra innecesario para
// este caso), así que se usan las fuentes nativas de jsPDF más parecidas
// ("times" como sustituto serif, "courier" como sustituto mono) manteniendo
// la MISMA paleta de colores (NAVY/NAVY_DARK/SLATE) del resto de la app.

const LABELS_EF: Record<"ef1" | "ef2" | "ef3" | "ef4" | "ef5", string> = {
  ef1: "EF1 · Seguimiento contenidos",
  ef2: "EF2 · Mejora micro currículo",
  ef3: "EF3 · Proceso difundido",
  ef4: "EF4 · Difusión syllabus EVA",
  ef5: "EF5 · Normativa institucional",
};

const EVIDENCIA_PDF_LABELS: Record<string, string> = {
  acta_ajuste_curricular: "EF2 · Acta de Ajuste Curricular",
  evidencia_difusion: "EF3 · Evidencia de Difusión",
  reglamento_normativa: "EF5 · Reglamento / Normativa Institucional",
};

const OPCIONES_LIKERT = ["Siempre", "Casi siempre", "Algunas veces", "Pocas veces", "Nunca"];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function colorPorEscala(escala: string | null): [number, number, number] {
  switch (escala) {
    case "Satisfactorio": return [21, 128, 61];
    case "Cuasi Satisfactorio": return [202, 138, 4];
    case "Poco Satisfactorio": return [249, 115, 22];
    case "Deficiente": return [239, 68, 68];
    default: return [100, 116, 139];
  }
}

function generarPdfAsignatura(jsPDF: typeof import("jspdf").default, params: {
  asignatura: Asignatura;
  cohorteActual: Cohorte | null;
  periodoActual: PeriodoAcademico | null;
  resultado: Resultado;
  radarImg: string | null;
  radarAspect: number;
  evidencias: Evidencia[];
  encuestaDetalle: EncuestaDetalle;
}) {
  const { asignatura, cohorteActual, periodoActual, resultado, radarImg, radarAspect, evidencias, encuestaDetalle } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 15;
  let y = 0;

  const [navyR, navyG, navyB] = hexToRgb(NAVY);
  const [navyDarkR, navyDarkG, navyDarkB] = hexToRgb(NAVY_DARK);
  const [slateR, slateG, slateB] = hexToRgb(SLATE);
  const [defR, defG, defB] = [239, 68, 68]; // mismo rojo que "Deficiente", reutilizado para "Sin evidencia"

  function checkPageBreak(alturaNecesaria: number) {
    if (y + alturaNecesaria > pageH - 15) {
      doc.addPage();
      y = 15;
    }
  }

  // ── Encabezado ──
  doc.setFillColor(navyR, navyG, navyB);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.text(asignatura.nombre, marginX, 14);
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text(`Docente: ${asignatura.docente || "—"}`, marginX, 21);
  doc.text(
    `Cohorte: ${cohorteActual?.nombre ?? "—"}   ·   PAO: ${periodoActual?.nombre ?? "—"}   ·   Generado: ${new Date().toLocaleString("es-EC")}`,
    marginX, 27,
  );
  y = 40;

  // ── Resumen general ──
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(navyDarkR, navyDarkG, navyDarkB);
  doc.text("Resumen general", marginX, y);
  y += 4;

  const [escR, escG, escB] = colorPorEscala(resultado.escala);
  doc.setFillColor(escR, escG, escB);
  doc.roundedRect(marginX, y, 55, 16, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("courier", "bold");
  doc.setFontSize(13);
  const textoResultado = resultado.resultado_final === null ? "Sin datos" : `${resultado.resultado_final}%${resultado.estado_general !== "completo" ? " (parcial)" : ""}`;
  doc.text(textoResultado, marginX + 27.5, y + 7, { align: "center" });
  doc.setFontSize(8);
  doc.text(resultado.escala ?? "Falta evidencia", marginX + 27.5, y + 12.5, { align: "center" });

  let alturaBloqueRadar = 22; // fallback si no hay imagen (mismo valor que antes)
  if (radarImg) {
    const imgW = 52;
    const imgH = imgW / radarAspect;
    doc.addImage(radarImg, "PNG", pageW - marginX - imgW, y - 3, imgW, imgH);
    alturaBloqueRadar = Math.max(22, imgH + 4);
  }
  y += alturaBloqueRadar;

  const efRows: { label: string; valor: number | null; estado: "ok" | "sin_datos" }[] = [
    { label: LABELS_EF.ef1, valor: resultado.ef1, estado: resultado.ef1_estado },
    { label: LABELS_EF.ef2, valor: resultado.ef2, estado: resultado.ef2_estado },
    { label: LABELS_EF.ef3, valor: resultado.ef3, estado: resultado.ef3_estado },
    { label: LABELS_EF.ef4, valor: resultado.ef4, estado: resultado.ef4_estado },
    { label: LABELS_EF.ef5, valor: resultado.ef5, estado: resultado.ef5_estado },
  ];
  doc.setFontSize(9);
  efRows.forEach((row) => {
    doc.setFont("courier", "normal");
    doc.setTextColor(slateR, slateG, slateB);
    doc.text(row.label, marginX, y);
    doc.setFont("courier", "bold");
    doc.setTextColor(navyDarkR, navyDarkG, navyDarkB);
    const texto = row.estado === "sin_datos" || row.valor === null ? "Sin datos" : `${row.valor}%`;
    doc.text(texto, marginX + 95, y);
    y += 6;
  });
  y += 4;

  // ── Detalle de encuesta (EF1 y EF4) ──
  checkPageBreak(20);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(navyDarkR, navyDarkG, navyDarkB);
  doc.text("Detalle de encuesta — EF1 y EF4", marginX, y);
  y += 3;
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(slateR, slateG, slateB);
  doc.text(`Respuestas consideradas para esta asignatura: ${encuestaDetalle.respuestas_totales_materia}`, marginX, y);
  y += 7;

  const preguntasEF = encuestaDetalle.preguntas.filter((p) => p.es_ef1 || p.es_ef4);
  preguntasEF.forEach((p) => {
    checkPageBreak(26);
    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.setTextColor(navyR, navyG, navyB);
    doc.text(`P${p.numero} (${p.es_ef1 ? "EF1" : "EF4"})`, marginX, y);
    y += 5;

    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(navyDarkR, navyDarkG, navyDarkB);
    const lineasTexto = doc.splitTextToSize(
      p.texto ?? "(pregunta no encontrada en la encuesta actual)",
      pageW - marginX * 2,
    );
    doc.text(lineasTexto, marginX, y);
    y += lineasTexto.length * 4.2 + 2;

    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.setTextColor(slateR, slateG, slateB);
    const resumenConteo = p.total > 0
      ? OPCIONES_LIKERT.map((op) => `${op}: ${p.conteos[op] ?? 0} (${Math.round(((p.conteos[op] ?? 0) / p.total) * 100)}%)`).join("   ·   ")
      : "Sin respuestas para esta materia";
    const lineasConteo = doc.splitTextToSize(resumenConteo, pageW - marginX * 2);
    doc.text(lineasConteo, marginX, y);
    y += lineasConteo.length * 4 + 6;
  });

  // ── Evidencia documental (EF2, EF3, EF5) ──
  checkPageBreak(20);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(navyDarkR, navyDarkG, navyDarkB);
  doc.text("Evidencia documental — EF2, EF3 y EF5", marginX, y);
  y += 8;

  (Object.keys(EVIDENCIA_PDF_LABELS) as (keyof typeof EVIDENCIA_PDF_LABELS)[]).forEach((tipo) => {
    checkPageBreak(15);
    const ev = evidencias.find((e) => e.tipo === tipo && e.vigente);
    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.setTextColor(navyR, navyG, navyB);
    doc.text(EVIDENCIA_PDF_LABELS[tipo], marginX, y);
    y += 5;
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    if (ev) {
      doc.setTextColor(navyDarkR, navyDarkG, navyDarkB);
      doc.text(`Archivo: ${ev.archivo_nombre ?? "—"}`, marginX, y);
      y += 4.5;
      doc.text(
        `Subido: ${new Date(ev.fecha_subida).toLocaleDateString("es-EC")}   ·   Por: ${ev.subido_por || "—"}`,
        marginX, y,
      );
      y += 8;
    } else {
      doc.setTextColor(defR, defG, defB);
      doc.text("Sin evidencia subida", marginX, y);
      y += 8;
    }
  });

  // ── Anexo: las 23 preguntas completas ──
  doc.addPage();
  y = 15;
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(navyDarkR, navyDarkG, navyDarkB);
  doc.text("Anexo — Las 23 preguntas de la encuesta de heteroevaluación", marginX, y);
  y += 8;

  encuestaDetalle.preguntas.forEach((p) => {
    checkPageBreak(20);
    doc.setFont("courier", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(navyR, navyG, navyB);
    const marcador = p.es_ef1 ? " (EF1)" : p.es_ef4 ? " (EF4)" : "";
    doc.text(`P${p.numero}${marcador}`, marginX, y);
    y += 4;

    doc.setFont("times", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(navyDarkR, navyDarkG, navyDarkB);
    const lineasTexto = doc.splitTextToSize(
      p.texto ?? "(pregunta no encontrada en la encuesta actual)",
      pageW - marginX * 2,
    );
    doc.text(lineasTexto, marginX, y);
    y += lineasTexto.length * 3.8 + 1;

    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(slateR, slateG, slateB);
    const resumenConteo = p.total > 0
      ? OPCIONES_LIKERT.map((op) => `${op}: ${p.conteos[op] ?? 0}`).join("  ·  ")
      : "Sin respuestas para esta materia";
    const lineasConteo = doc.splitTextToSize(resumenConteo, pageW - marginX * 2);
    doc.text(lineasConteo, marginX, y);
    y += lineasConteo.length * 3.6 + 4;
  });

  doc.save(`indicador_11.2_${asignatura.nombre.replace(/\s+/g, "_")}.pdf`);
}

// ── Tab: Evidencias (diseño original de Figma: fuentes + vista previa) ────
const TIPOS: { value: Evidencia["tipo"]; label: string }[] = [
  { value: "malla_curricular", label: "Malla Curricular" },
  { value: "syllabus", label: "Syllabus" },
  { value: "acta_retroalimentacion", label: "Acta de Retroalimentación" },
  { value: "acta_ajuste_curricular", label: "Acta de Ajuste Curricular (EF2)" },
  { value: "evidencia_difusion", label: "Evidencia de Difusión (EF3)" },
  { value: "reglamento_normativa", label: "Reglamento / Normativa Institucional (EF5)" },
];

function TabEvidencias({ asignatura, onEvidenceUploaded }: { asignatura: Asignatura; onEvidenceUploaded: () => void }) {
  const [lista, setLista] = useState<Evidencia[]>([]);
  const [selected, setSelected] = useState<Evidencia["tipo"] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = { current: null as HTMLInputElement | null };

  // malla_curricular y reglamento_normativa (EF5) son evidencia de TODA LA
  // CARRERA (el mismo documento aplica a todas las cohortes/PAO/
  // asignaturas de esa carrera) — se suben una sola vez por carrera, no
  // por asignatura ni por PAO. syllabus/acta_retroalimentacion/
  // acta_ajuste_curricular (EF2)/evidencia_difusion (EF3) sí son por
  // asignatura.
  const TIPOS_POR_CARRERA = new Set(["malla_curricular", "reglamento_normativa"]);

  const load = useCallback(async () => {
    try {
      // El backend ya devuelve la unión (evidencia propia de la asignatura
      // + evidencia institucional del PAO al que pertenece) cuando se
      // consulta por "asignatura".
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
    const esDeCarrera = TIPOS_POR_CARRERA.has(tipoDestino);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("tipo", tipoDestino);
      // El backend deriva el PAO automáticamente a partir de la asignatura
      // cuando el tipo es institucional (EF2/EF3/EF5) — no hace falta que
      // el frontend distinga el flujo, solo mandamos la asignatura actual
      // como siempre.
      form.append("asignatura", String(asignatura.id));
      form.append("archivo", file);
      await fetch(`${API_BASE}/api/evidencias/`, { method: "POST", body: form }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Error al subir");
      });
      toast.success(
        esDeCarrera
          ? "Evidencia subida — aplica a toda la carrera"
          : "Evidencia subida correctamente"
      );
      setSelected(tipoDestino);
      load();
      await onEvidenceUploaded();
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
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>
                      {TIPOS_POR_CARRERA.has(t.value) ? "Aplica a toda la carrera" : `Fuente ${i + 1}`}
                    </p>
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
        <div className="flex-1 overflow-hidden flex items-center justify-center min-h-0" style={{ minHeight: 400 }}>
          {selectedEvidencia ? (
            <iframe
              src={selectedEvidencia.archivo_url}
              width="100%"
              height="100%"
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
  formula: "EF1×0.33 + EF2×0.27 + EF3×0.20 + EF4×0.13 + EF5×0.07",
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