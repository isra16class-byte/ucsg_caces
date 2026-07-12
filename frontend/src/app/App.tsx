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
      // jsPDF pesa ~300kB y solo se usa acá (Exportar PDF de la Entrega 3). Se
      // carga de forma dinámica (code-splitting) para que NO forme parte del
      // bundle inicial que descarga cualquier usuario con solo abrir la
      // página. Ya NO se usa html2canvas: el resumen general (antes una
      // captura de pantalla del radar) ahora se dibuja directamente con
      // jsPDF como donut + barras horizontales, igual que el resto del PDF —
      // esto fue lo que eliminó el desorden/espaciado irregular del PDF
      // anterior, porque todas las alturas se calculan a partir del texto
      // real en vez de mezclar una imagen capturada del DOM con coordenadas
      // fijas en milímetros.
      const [{ default: jsPDF }, evidenciasRes, encuestaDetalle] = await Promise.all([
        import("jspdf"),
        apiFetch(`/api/evidencias/?asignatura=${asignatura.id}`) as Promise<{ total: number; evidencias: Evidencia[] }>,
        apiFetch(`/api/encuesta-detalle/?asignatura=${asignatura.id}`) as Promise<EncuestaDetalle>,
      ]);

      generarPdfAsignatura(jsPDF, {
        asignatura,
        cohorteActual,
        periodoActual,
        resultado: data,
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

// ── Generación del PDF de la Entrega 3 (jsPDF, sin html2canvas) ───────────
// Rediseño 11 de julio: el radar ya NO se captura con html2canvas (esa
// captura de pantalla era la causa de espaciados inconsistentes: cualquier
// diferencia de tamaño entre lo que se veía en pantalla y el recorte
// calculado desalineaba todo lo que venía después). En su lugar, el
// resumen general se dibuja como un donut + barras horizontales 100% con
// jsPDF, igual que el resto del documento, así todas las alturas se miden
// ANTES de dibujar (nunca con un valor fijo "a ojo") y el salto de página
// (`checkPageBreak`) siempre reserva el espacio real que va a ocupar cada
// bloque. Se agregan además dos tablas (fuentes de evidencia y evidencia
// documental) con encabezado de color y filas alternadas, y el anexo de
// las 23 preguntas pasa a un formato compacto de una sola línea de
// resultado ("Respuesta registrada: X (Y%)"), igual al reporte de
// referencia que preparó la coordinación académica.
// Nota de diseño (sin cambios): jsPDF no permite embeber "Libre
// Baskerville"/"DM Mono" sin cargar los archivos de fuente en base64, así
// que se usan las fuentes nativas más parecidas ("times" como sustituto
// serif, "courier" como sustituto mono), manteniendo la MISMA paleta de
// colores (NAVY/NAVY_DARK/SLATE) del resto de la app.

type PdfDoc = InstanceType<typeof import("jspdf").default>;
type RGB = [number, number, number];

const EF_INFO: Record<"ef1" | "ef2" | "ef3" | "ef4" | "ef5", { titulo: string; descripcion: string; peso: number; fuente: string }> = {
  ef1: { titulo: "EF1", descripcion: "Seguimiento de contenidos del syllabus", peso: 33, fuente: "Encuesta de heteroevaluación, syllabus y malla curricular" },
  ef2: { titulo: "EF2", descripcion: "Mejora al micro currículo", peso: 27, fuente: "Documentos de planificación y actas de resolución" },
  ef3: { titulo: "EF3", descripcion: "Proceso de seguimiento difundido", peso: 20, fuente: "EVA, informes y registros de difusión" },
  ef4: { titulo: "EF4", descripcion: "Difusión del syllabus en el EVA", peso: 13, fuente: "EVA — carga y difusión del syllabus" },
  ef5: { titulo: "EF5", descripcion: "Normativa institucional", peso: 7, fuente: "Reglamento interno de seguimiento" },
};

const EVIDENCIA_PDF_LABELS: Record<string, string> = {
  acta_ajuste_curricular: "Acta de Ajuste Curricular",
  evidencia_difusion: "Evidencia de Difusión",
  reglamento_normativa: "Reglamento / Normativa Institucional",
};
const EVIDENCIA_EF: Record<string, string> = {
  acta_ajuste_curricular: "EF2",
  evidencia_difusion: "EF3",
  reglamento_normativa: "EF5",
};

const OPCIONES_LIKERT = ["Siempre", "Casi siempre", "Algunas veces", "Pocas veces", "Nunca"];

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function colorPorEscala(escala: string | null): RGB {
  switch (escala) {
    case "Satisfactorio": return [21, 128, 61];
    case "Cuasi Satisfactorio": return [202, 138, 4];
    case "Poco Satisfactorio": return [249, 115, 22];
    case "Deficiente": return [239, 68, 68];
    default: return [100, 116, 139];
  }
}

// Mismos cortes oficiales de CACES (≥0.75 / ≥0.50 / ≥0.25 / <0.25) para
// colorear cada barra de EF de forma individual.
function colorPorValor(valor: number | null): RGB {
  if (valor === null) return [148, 163, 184];
  if (valor >= 75) return [21, 128, 61];
  if (valor >= 50) return [202, 138, 4];
  if (valor >= 25) return [249, 115, 22];
  return [239, 68, 68];
}

function opcionDominante(conteos: Record<string, number>, total: number): { label: string; pct: number } | null {
  if (total <= 0) return null;
  let mejorLabel = OPCIONES_LIKERT[0];
  let mejorConteo = -1;
  OPCIONES_LIKERT.forEach((op) => {
    const c = conteos[op] ?? 0;
    if (c > mejorConteo) { mejorConteo = c; mejorLabel = op; }
  });
  return { label: mejorLabel, pct: Math.round((mejorConteo / total) * 100) };
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function drawRingSegment(doc: PdfDoc, cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number, rgb: RGB) {
  if (endDeg <= startDeg) return;
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const step = 3;
  for (let a = startDeg; a < endDeg; a += step) {
    const a2 = Math.min(a + step, endDeg);
    const [ox1, oy1] = polarPoint(cx, cy, rOuter, a);
    const [ox2, oy2] = polarPoint(cx, cy, rOuter, a2);
    const [ix1, iy1] = polarPoint(cx, cy, rInner, a);
    const [ix2, iy2] = polarPoint(cx, cy, rInner, a2);
    doc.triangle(ox1, oy1, ox2, oy2, ix1, iy1, "F");
    doc.triangle(ox2, oy2, ix2, iy2, ix1, iy1, "F");
  }
}

// Donut: pct 0-100, empieza arriba (12 en punto) y avanza en sentido horario.
function drawDonut(doc: PdfDoc, cx: number, cy: number, rOuter: number, rInner: number, pct: number, colorRgb: RGB) {
  const trackRgb: RGB = [226, 232, 240];
  const sweep = Math.max(0, Math.min(100, pct)) * 3.6;
  if (sweep < 360) drawRingSegment(doc, cx, cy, rOuter, rInner, sweep, 360, trackRgb);
  if (sweep > 0) drawRingSegment(doc, cx, cy, rOuter, rInner, 0, sweep, colorRgb);
}

function drawBarraHorizontal(doc: PdfDoc, x: number, y: number, w: number, h: number, pct: number, colorRgb: RGB) {
  doc.setFillColor(226, 232, 240);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
  const anchoLleno = (w * Math.max(0, Math.min(100, pct))) / 100;
  if (anchoLleno > 0.6) {
    doc.setFillColor(colorRgb[0], colorRgb[1], colorRgb[2]);
    doc.roundedRect(x, y, anchoLleno, h, h / 2, h / 2, "F");
  }
}

function drawSectionHeader(doc: PdfDoc, titulo: string, subtitulo: string, x: number, y: number, contentW: number, navyDark: RGB, slate: RGB): number {
  doc.setFont("times", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(navyDark[0], navyDark[1], navyDark[2]);
  doc.text(titulo, x, y);
  let yy = y + 4.5;
  if (subtitulo) {
    doc.setFont("times", "normal");
    doc.setFontSize(8);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    const lineas = doc.splitTextToSize(subtitulo, contentW);
    doc.text(lineas, x, yy);
    yy += lineas.length * 3.6 + 2;
  }
  return yy + 1.5;
}

// Tabla genérica con encabezado de color y filas alternadas. Mide el alto
// real de cada fila (según el texto envuelto más largo de esa fila) ANTES
// de dibujarla, y repite el encabezado si la fila cae en una página nueva.
function dibujarTabla(
  doc: PdfDoc, xStart: number, yStart: number,
  columnas: { header: string; width: number }[],
  filas: string[][],
  colores: { navy: RGB; navyDark: RGB; slate: RGB },
  pageH: number,
): number {
  const marginBottom = 15;
  const headerH = 7.5;
  const anchoTotal = columnas.reduce((s, c) => s + c.width, 0);
  let y = yStart;

  function dibujarEncabezado() {
    doc.setFillColor(colores.navy[0], colores.navy[1], colores.navy[2]);
    doc.rect(xStart, y, anchoTotal, headerH, "F");
    doc.setFont("courier", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    let cx = xStart;
    columnas.forEach((col) => {
      doc.text(col.header.toUpperCase(), cx + 2.5, y + 5);
      cx += col.width;
    });
    y += headerH;
  }

  dibujarEncabezado();

  filas.forEach((fila, i) => {
    const lineasPorCelda = fila.map((texto, ci) => doc.splitTextToSize(texto || "—", columnas[ci].width - 5));
    const maxLineas = Math.max(...lineasPorCelda.map((l: string[]) => l.length), 1);
    const rowH = maxLineas * 4 + 3;

    if (y + rowH > pageH - marginBottom) {
      doc.addPage();
      y = 15;
      dibujarEncabezado();
    }

    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 253);
      doc.rect(xStart, y, anchoTotal, rowH, "F");
    }

    doc.setFont("times", "normal");
    doc.setFontSize(8);
    doc.setTextColor(colores.navyDark[0], colores.navyDark[1], colores.navyDark[2]);
    let cx = xStart;
    fila.forEach((_texto, ci) => {
      doc.text(lineasPorCelda[ci], cx + 2.5, y + 4.3);
      cx += columnas[ci].width;
    });
    y += rowH;
  });

  doc.setDrawColor(226, 232, 240);
  doc.line(xStart, y, xStart + anchoTotal, y);
  return y;
}

function generarPdfAsignatura(jsPDF: typeof import("jspdf").default, params: {
  asignatura: Asignatura;
  cohorteActual: Cohorte | null;
  periodoActual: PeriodoAcademico | null;
  resultado: Resultado;
  evidencias: Evidencia[];
  encuestaDetalle: EncuestaDetalle;
}) {
  const { asignatura, cohorteActual, periodoActual, resultado, evidencias, encuestaDetalle } = params;
  const doc: PdfDoc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 15;
  const contentW = pageW - marginX * 2;
  let y = 0;

  const navy = hexToRgb(NAVY);
  const navyDark = hexToRgb(NAVY_DARK);
  const slate = hexToRgb(SLATE);
  const rojoSinEvidencia: RGB = [239, 68, 68];

  function checkPageBreak(alturaNecesaria: number) {
    if (y + alturaNecesaria > pageH - 15) {
      doc.addPage();
      y = 15;
    }
  }

  // ── Encabezado ──
  const tituloLineas = doc.splitTextToSize(asignatura.nombre, contentW);
  const alturaEncabezado = 20 + tituloLineas.length * 6.5;
  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.rect(0, 0, pageW, alturaEncabezado, "F");
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(190, 205, 225);
  doc.text("INDICADOR 11.2 · CACES — SEGUIMIENTO DE SYLLABUS", marginX, 9);
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(tituloLineas, marginX, 18);
  y = alturaEncabezado + 9;

  // Fila de metadatos (DOCENTE / COHORTE / PAO / GENERADO)
  const metaColW = contentW / 4;
  const meta: [string, string][] = [
    ["DOCENTE", asignatura.docente || "—"],
    ["COHORTE", cohorteActual?.nombre ?? "—"],
    ["PAO", periodoActual?.nombre ?? "—"],
    ["GENERADO", new Date().toLocaleString("es-EC", { day: "2-digit", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })],
  ];
  meta.forEach(([label, valor], i) => {
    const mx = marginX + i * metaColW;
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    doc.text(label, mx, y);
    doc.setFont("times", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(navyDark[0], navyDark[1], navyDark[2]);
    const lineasValor = doc.splitTextToSize(valor, metaColW - 4);
    doc.text(lineasValor, mx, y + 5);
  });
  y += 16;

  // ── Resumen general (donut + barras por EF) ──
  y = drawSectionHeader(
    doc, "Resultado general",
    "Puntaje agregado del indicador y desempeño individual de cada Elemento Fundamental (EF), ponderado según el modelo oficial de evaluación CACES.",
    marginX, y, contentW, navyDark, slate,
  );

  const bloqueAltura = 46;
  checkPageBreak(bloqueAltura);
  const yBloque = y;

  // Donut a la izquierda
  const donutCx = marginX + 26;
  const donutCy = yBloque + bloqueAltura / 2 - 2;
  const colorEscala = colorPorEscala(resultado.escala);
  if (resultado.resultado_final !== null) {
    drawDonut(doc, donutCx, donutCy, 20, 13, resultado.resultado_final, colorEscala);
    doc.setFont("courier", "bold");
    doc.setFontSize(15);
    doc.setTextColor(navyDark[0], navyDark[1], navyDark[2]);
    doc.text(`${resultado.resultado_final}%`, donutCx, donutCy + 2, { align: "center" });
  } else {
    drawDonut(doc, donutCx, donutCy, 20, 13, 0, [148, 163, 184]);
    doc.setFont("courier", "bold");
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text("Sin datos", donutCx, donutCy + 1.5, { align: "center" });
  }
  doc.setFont("times", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(colorEscala[0], colorEscala[1], colorEscala[2]);
  doc.text(resultado.escala ?? "Falta evidencia", donutCx, donutCy + 27, { align: "center" });

  // Filas de EF a la derecha
  const efKeys: ("ef1" | "ef2" | "ef3" | "ef4" | "ef5")[] = ["ef1", "ef2", "ef3", "ef4", "ef5"];
  const efColX = marginX + 58;
  const efColW = contentW - 58;
  const textW = efColW * 0.55;
  const barX = efColX + textW + 3;
  const barW = efColW - textW - 3 - 15;
  const pctX = barX + barW + 3;
  const rowH = bloqueAltura / 5;

  efKeys.forEach((key, i) => {
    const info = EF_INFO[key];
    const valor = resultado[key];
    const ry = yBloque + i * rowH;
    const colorBarra = colorPorValor(valor);

    doc.setFont("times", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(navyDark[0], navyDark[1], navyDark[2]);
    doc.text(`${info.titulo}  ${info.descripcion}`, efColX, ry + 4.5);
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    doc.text(`peso ${info.peso}% del indicador`, efColX, ry + 8.3);

    const barY = ry + 3;
    drawBarraHorizontal(doc, barX, barY, barW, 3, valor ?? 0, colorBarra);
    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.setTextColor(colorBarra[0], colorBarra[1], colorBarra[2]);
    doc.text(valor === null ? "—" : `${valor}%`, pctX, barY + 2.6);
  });
  y = yBloque + bloqueAltura + 4;

  // Nota metodológica
  checkPageBreak(20);
  const notaTexto =
    "Nota metodológica — este porcentaje es un proxy continuo de gestión interna que la carrera usa para prepararse antes de la visita del Comité Externo. El procedimiento oficial de CACES categoriza cada EF de forma discreta (Satisfactorio / Cuasi satisfactorio / Poco satisfactorio / Deficiente) mediante juicio de un evaluador humano sobre la evidencia presentada.";
  const notaLineas = doc.splitTextToSize(notaTexto, contentW - 8);
  const notaAltura = notaLineas.length * 3.6 + 6;
  doc.setFillColor(248, 250, 253);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, y, contentW, notaAltura, 2, 2, "FD");
  doc.setFont("times", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(slate[0], slate[1], slate[2]);
  doc.text(notaLineas, marginX + 4, y + 5);
  y += notaAltura + 8;

  // ── Fuentes de evidencia por elemento ──
  checkPageBreak(20);
  y = drawSectionHeader(doc, "Fuentes de evidencia por elemento", "Origen de la información que sustenta el resultado de cada Elemento Fundamental.", marginX, y, contentW, navyDark, slate);
  const filasFuentes = efKeys.map((key) => {
    const info = EF_INFO[key];
    const valor = resultado[key];
    return [info.titulo, info.descripcion, info.fuente, valor === null ? "Sin datos" : `${valor}%`];
  });
  y = dibujarTabla(
    doc, marginX, y,
    [
      { header: "EF", width: 12 },
      { header: "Elemento fundamental", width: 48 },
      { header: "Fuente de evidencia", width: 85 },
      { header: "Resultado", width: contentW - 12 - 48 - 85 },
    ],
    filasFuentes,
    { navy, navyDark, slate },
    pageH,
  );
  y += 10;

  // ── Detalle de encuesta (EF1 y EF4) ──
  checkPageBreak(20);
  y = drawSectionHeader(
    doc, "Detalle de la encuesta de heteroevaluación",
    `Preguntas que alimentan EF1 y EF4 · respuestas consideradas para esta asignatura: ${encuestaDetalle.respuestas_totales_materia}.`,
    marginX, y, contentW, navyDark, slate,
  );

  const preguntasEF = encuestaDetalle.preguntas.filter((p) => p.es_ef1 || p.es_ef4);
  preguntasEF.forEach((p) => {
    const textoPregunta = p.texto ?? "(pregunta no encontrada en la encuesta actual)";
    const lineasTexto = doc.splitTextToSize(textoPregunta, contentW);
    const resumenConteo = p.total > 0
      ? OPCIONES_LIKERT.map((op) => `${op}: ${p.conteos[op] ?? 0} (${Math.round(((p.conteos[op] ?? 0) / p.total) * 100)}%)`).join("  ·  ")
      : "Sin respuestas para esta materia";
    const lineasConteo = doc.splitTextToSize(resumenConteo, contentW);
    const alturaBloque = 5 + lineasTexto.length * 4.2 + 2 + lineasConteo.length * 3.8 + 5;

    checkPageBreak(alturaBloque);
    doc.setFont("courier", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(`P${p.numero}  ${p.es_ef1 ? "EF1" : "EF4"}`, marginX, y);
    y += 5;

    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(navyDark[0], navyDark[1], navyDark[2]);
    doc.text(lineasTexto, marginX, y);
    y += lineasTexto.length * 4.2 + 2;

    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(slate[0], slate[1], slate[2]);
    doc.text(lineasConteo, marginX, y);
    y += lineasConteo.length * 3.8 + 5;
  });
  y += 4;

  // ── Evidencia documental (EF2, EF3, EF5) ──
  checkPageBreak(20);
  y = drawSectionHeader(doc, "Evidencia documental", "Archivos que sustentan EF2, EF3 y EF5.", marginX, y, contentW, navyDark, slate);
  const filasEvidencia = (Object.keys(EVIDENCIA_PDF_LABELS) as (keyof typeof EVIDENCIA_PDF_LABELS)[]).map((tipo) => {
    const ev = evidencias.find((e) => e.tipo === tipo && e.vigente);
    return [
      EVIDENCIA_EF[tipo],
      EVIDENCIA_PDF_LABELS[tipo],
      ev ? (ev.archivo_nombre ?? "—") : "Sin evidencia subida",
      ev ? new Date(ev.fecha_subida).toLocaleDateString("es-EC") : "—",
      ev ? (ev.subido_por || "—") : "—",
    ];
  });
  y = dibujarTabla(
    doc, marginX, y,
    [
      { header: "EF", width: 12 },
      { header: "Tipo de evidencia", width: 48 },
      { header: "Archivo", width: 70 },
      { header: "Subido", width: 25 },
      { header: "Responsable", width: contentW - 12 - 48 - 70 - 25 },
    ],
    filasEvidencia,
    { navy, navyDark, slate },
    pageH,
  );

  // ── Anexo: las 23 preguntas, formato compacto ──
  doc.addPage();
  y = 15;
  y = drawSectionHeader(
    doc, "Anexo — Las 23 preguntas de la encuesta de heteroevaluación",
    "Distribución de respuestas por pregunta. Las preguntas marcadas con EF alimentan directamente el cálculo del indicador.",
    marginX, y, contentW, navyDark, slate,
  );

  encuestaDetalle.preguntas.forEach((p) => {
    const marcador = p.es_ef1 ? "  EF1" : p.es_ef4 ? "  EF4" : "";
    const textoPregunta = p.texto ?? "(pregunta no encontrada en la encuesta actual)";
    const lineasTexto = doc.splitTextToSize(textoPregunta, contentW);
    const dom = opcionDominante(p.conteos, p.total);
    const lineaResultado = dom ? `Respuesta registrada: ${dom.label} (${dom.pct}%)` : "Sin respuestas para esta materia";
    const alturaBloque = 4 + lineasTexto.length * 3.9 + 4.5 + 4;

    checkPageBreak(alturaBloque);
    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(`P${p.numero}${marcador}`, marginX, y);
    y += 4;

    doc.setFont("times", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(navyDark[0], navyDark[1], navyDark[2]);
    doc.text(lineasTexto, marginX, y);
    y += lineasTexto.length * 3.9;

    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(dom ? slate[0] : rojoSinEvidencia[0], dom ? slate[1] : rojoSinEvidencia[1], dom ? slate[2] : rojoSinEvidencia[2]);
    doc.text(lineaResultado, marginX, y + 3.5);
    y += 4 + 4;
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