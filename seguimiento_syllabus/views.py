import csv
import urllib.request
import re

from .models import Asignatura, Evidencia

URL_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSS9YX0N26YnO5pUAYc2U7JchenIAEasrpq0gs79Up0fOLrayn6JX-FmuolcXSkIL0MReJ7j0jpXPtC/pub?output=csv"
PUNTAJE_MAP = {"Siempre": 5, "Casi siempre": 4, "Algunas veces": 3, "Pocas veces": 2, "Nunca": 1}


def _buscar_columna(preguntas, numero):
    patron = re.compile(rf'\[P{numero}[\.\]]', re.IGNORECASE)
    return [p for p in preguntas if patron.search(p)]


def _descargar_csv():
    req = urllib.request.Request(URL_CSV, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req, timeout=10)
    return [l.decode("utf-8") for l in response.readlines()]


def _detectar_indice_materia(headers):
    """
    Busca, entre las primeras columnas (antes de las preguntas), cuál
    corresponde a 'Materia'. Si no la encuentra por nombre, usa la posición
    1 por defecto (Timestamp, Materia, Profesor, preguntas...).
    """
    for i, h in enumerate(headers[:3]):
        if 'materia' in h.strip().lower():
            return i
    return 1 if len(headers) > 1 else None


def obtener_materias_disponibles():
    """Devuelve la lista de nombres de materia distintos encontrados en las
    respuestas de la encuesta (Google Forms), útil para hacer coincidir
    nombres de Asignatura con las respuestas reales."""
    try:
        lines = _descargar_csv()
    except Exception:
        return []

    reader = csv.reader(lines)
    headers = next(reader)
    idx_materia = _detectar_indice_materia(headers)
    if idx_materia is None:
        return []

    materias = set()
    for row in reader:
        if len(row) > idx_materia and row[idx_materia].strip():
            materias.add(row[idx_materia].strip())
    return sorted(materias)


def _calcular_ef_desde_csv(materia=None):
    """
    Calcula EF1, EF3, EF4 (provenientes de la encuesta de heteroevaluación).
    Si se pasa `materia`, solo se consideran las respuestas de esa materia;
    si es None, se agregan TODAS las respuestas (comportamiento original).
    """
    try:
        lines = _descargar_csv()
    except Exception:
        return None

    reader = csv.reader(lines)
    headers = next(reader)
    idx_materia = _detectar_indice_materia(headers)
    preguntas = headers[3:]

    totales = {p: 0 for p in preguntas}
    conteos = {p: 0 for p in preguntas}
    total_filas = 0

    for row in reader:
        if len(row) < 4:
            continue
        if materia and idx_materia is not None:
            if len(row) <= idx_materia or row[idx_materia].strip().lower() != materia.strip().lower():
                continue
        total_filas += 1
        for i, valor in enumerate(row[3:]):
            if i < len(preguntas) and valor.strip() in PUNTAJE_MAP:
                totales[preguntas[i]] += PUNTAJE_MAP[valor.strip()]
                conteos[preguntas[i]] += 1

    promedios = {}
    for p in preguntas:
        if conteos[p] > 0:
            promedios[p] = round((totales[p] / conteos[p] / 5) * 100, 1)
        else:
            promedios[p] = 0

    ef1_pregs = _buscar_columna(preguntas, 5) + _buscar_columna(preguntas, 8) + _buscar_columna(preguntas, 13)
    ef3_pregs = _buscar_columna(preguntas, 7)
    ef4_pregs = _buscar_columna(preguntas, 6)

    def promedio_ef_decimal(preg_list):
        vals = [promedios[p] for p in preg_list if p in promedios]
        if not vals:
            return 0.0
        return round(sum(vals) / len(vals) / 100, 4)

    ef1 = promedio_ef_decimal(ef1_pregs)
    ef3 = promedio_ef_decimal(ef3_pregs)
    ef4 = promedio_ef_decimal(ef4_pregs)
    ef2 = 0.0
    ef5 = 0.0

    ef_puntaje = round(ef1*0.33 + ef2*0.27 + ef3*0.20 + ef4*0.13 + ef5*0.07, 2)

    return {
        'ef1': ef1, 'ef2': ef2, 'ef3': ef3, 'ef4': ef4, 'ef5': ef5,
        'ef_puntaje': ef_puntaje,
        'respuestas': total_filas,
        'promedio_general': round(sum(promedios.values()) / len(promedios), 1) if promedios else 0,
    }


def _calcular_resultado_generico(evidencias_qs, materia_filtro):
    """
    Núcleo del cálculo EF1-EF5, parametrizado por:
    - evidencias_qs: queryset de Evidencia a considerar (de una asignatura,
      o de TODA la cohorte).
    - materia_filtro: nombre de materia para filtrar la encuesta (una
      asignatura), o None para agregarla completa (evaluación general
      de la cohorte, tal como la evalúa CACES).
    """
    evidencias_info = {
        'malla_curricular': {'subida': False, 'label': 'Malla Curricular'},
        'syllabus': {'subida': False, 'label': 'Syllabus'},
        'acta_retroalimentacion': {'subida': False, 'label': 'Acta de Retroalimentación'},
        'acta_ajuste_curricular': {'subida': False, 'label': 'Acta de Ajuste Curricular (EF2)'},
        'evidencia_difusion': {'subida': False, 'label': 'Evidencia de Difusión (EF3)'},
        'reglamento_normativa': {'subida': False, 'label': 'Reglamento / Normativa Institucional (EF5)'},
    }
    tipos_vigentes = set(
        evidencias_qs.filter(vigente=True).values_list('tipo', flat=True)
    )
    for tipo in tipos_vigentes:
        if tipo in evidencias_info:
            evidencias_info[tipo]['subida'] = True

    tiene_ef2 = evidencias_info['acta_ajuste_curricular']['subida']
    tiene_ef3 = evidencias_info['evidencia_difusion']['subida']
    tiene_ef5 = evidencias_info['reglamento_normativa']['subida']
    total_evidencias = sum([tiene_ef2, tiene_ef3, tiene_ef5])
    pct_evidencias = round(total_evidencias / 3 * 100, 1) if total_evidencias > 0 else 0

    datos_ef = _calcular_ef_desde_csv(materia=materia_filtro)
    ef_disponible = datos_ef is not None and datos_ef['respuestas'] > 0

    ef1 = datos_ef['ef1'] if ef_disponible else None
    ef3 = datos_ef['ef3'] if ef_disponible else None
    ef4 = datos_ef['ef4'] if ef_disponible else None
    respuestas = datos_ef['respuestas'] if ef_disponible else 0
    promedio_general = datos_ef['promedio_general'] if ef_disponible else 0

    ef2_estado = 'ok' if tiene_ef2 else 'sin_datos'
    ef3_estado = 'ok' if tiene_ef3 else 'sin_datos'
    ef5_estado = 'ok' if tiene_ef5 else 'sin_datos'

    if ef_disponible and ef2_estado == 'ok' and ef3_estado == 'ok' and ef5_estado == 'ok':
        ef2 = 1.0
        ef3_doc = 1.0
        ef5 = 1.0
        ef_puntaje = round(ef1 * 0.33 + ef2 * 0.27 + ef3_doc * 0.20 + ef4 * 0.13 + ef5 * 0.07, 4)
        valoracion_general = round(ef_puntaje * 100, 1)
        resultado_final = valoracion_general
        estado_general = 'completo'
        fuente_resultado = 'combinado'
    else:
        ef2 = None
        ef3_doc = None
        ef5 = None
        ef_puntaje = None
        valoracion_general = None
        resultado_final = None
        estado_general = 'incompleto'
        fuente_resultado = 'incompleto'

    if valoracion_general is not None and valoracion_general >= 75:
        escala = 'Satisfactorio'
        color_escala = '#15803D'
    elif valoracion_general is not None and valoracion_general >= 50:
        escala = 'Cuasi Satisfactorio'
        color_escala = '#CA8A04'
    elif valoracion_general is not None and valoracion_general >= 25:
        escala = 'Poco Satisfactorio'
        color_escala = '#F97316'
    elif valoracion_general is not None:
        escala = 'Deficiente'
        color_escala = '#EF4444'
    else:
        escala = None
        color_escala = None

    dash = round(resultado_final * 3.393, 1) if resultado_final is not None else None

    return {
        'resultado_final': resultado_final,
        'valoracion_general': valoracion_general,
        'estado_general': estado_general,
        'escala': escala,
        'color_escala': color_escala,
        'fuente_resultado': fuente_resultado,
        'dash': dash,
        'evidencias_info': evidencias_info,
        'total_evidencias': total_evidencias,
        'pct_evidencias': pct_evidencias,
        'ef_disponible': ef_disponible,
        'ef1': round(ef1 * 100, 1) if ef1 is not None else None,
        'ef1_estado': 'ok' if ef_disponible else 'sin_datos',
        'ef2': round(ef2 * 100, 1) if ef2 is not None else None,
        'ef2_estado': ef2_estado,
        'ef3': round(ef3_doc * 100, 1) if ef3_doc is not None else None,
        'ef3_estado': ef3_estado,
        'ef4': round(ef4 * 100, 1) if ef4 is not None else None,
        'ef4_estado': 'ok' if ef_disponible else 'sin_datos',
        'ef5': round(ef5 * 100, 1) if ef5 is not None else None,
        'ef5_estado': ef5_estado,
        'ef_puntaje': ef_puntaje,
        'respuestas': respuestas,
        'promedio_general': promedio_general,
    }


def calcular_resultado_asignatura(asignatura):
    """
    Calcula el resultado EF1-EF5 para UNA asignatura: solo sus evidencias,
    y la encuesta filtrada por su nombre de materia.
    """
    evidencias_qs = Evidencia.objects.filter(asignatura=asignatura)
    return _calcular_resultado_generico(evidencias_qs, materia_filtro=asignatura.nombre)


def calcular_resultado_general(cohorte, periodo=None):
    """
    Calcula el resultado EF1-EF5 AGREGADO de toda la cohorte: TODAS las
    evidencias de TODAS sus asignaturas, y TODA la encuesta sin filtrar
    por materia. Esta es la forma en que CACES evalúa el indicador 11.2:
    como un solo bloque, marcando las casillas EF a nivel de cohorte/carrera.
    """
    evidencias_qs = Evidencia.objects.filter(asignatura__periodo_academico__cohorte=cohorte)
    if periodo is not None:
        evidencias_qs = evidencias_qs.filter(asignatura__periodo_academico=periodo)
    return _calcular_resultado_generico(evidencias_qs, materia_filtro=None)
