import csv
import urllib.request
import re

from .models import Asignatura, Evidencia

URL_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSS9YX0N26YnO5pUAYc2U7JchenIAEasrpq0gs79Up0fOLrayn6JX-FmuolcXSkIL0MReJ7j0jpXPtC/pub?output=csv"
PUNTAJE_MAP = {"Siempre": 5, "Casi siempre": 4, "Algunas veces": 3, "Pocas veces": 2, "Nunca": 1}


def _buscar_columna(preguntas, numero):
    patron = re.compile(rf'\[P{numero}[\.\]]', re.IGNORECASE)
    return [p for p in preguntas if patron.search(p)]


def _texto_pregunta(header, numero):
    """
    Extrae el texto legible de una pregunta a partir del encabezado real de
    columna del CSV (que trae el formato "...[P5. Informó al inicio...]").
    Se usa para el detalle de encuesta del PDF (Entrega 3), para no
    hardcodear el texto de las 23 preguntas en el frontend: se toma siempre
    del propio CSV, misma fuente que ya usa el cálculo de EF1/EF4.
    """
    m = re.search(rf'\[P{numero}\.?\s*(.*?)\]', header, re.IGNORECASE)
    if m and m.group(1).strip():
        return m.group(1).strip()
    return header.strip()


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


def obtener_detalle_encuesta(materia=None):
    """
    Devuelve, para cada una de las 23 preguntas de la encuesta de
    heteroevaluación, su texto completo y el desglose de respuestas (conteo
    por cada opción del Likert), filtrando por materia si se indica.

    Reutiliza _descargar_csv/_detectar_indice_materia/_buscar_columna, la
    MISMA lógica que ya usa _calcular_ef_desde_csv para EF1/EF4 — así el
    desglose que se muestra en el PDF (Entrega 3) queda garantizado
    consistente con el % que ya se ve en pantalla, en vez de reimplementar
    el matching de columnas por separado.
    """
    try:
        lines = _descargar_csv()
    except Exception:
        return None

    reader = csv.reader(lines)
    headers = next(reader)
    idx_materia = _detectar_indice_materia(headers)
    preguntas = headers[3:]

    opciones = list(PUNTAJE_MAP.keys())
    conteos = {p: {op: 0 for op in opciones} for p in preguntas}
    total_filas_materia = 0

    for row in reader:
        if len(row) < 4:
            continue
        if materia and idx_materia is not None:
            if len(row) <= idx_materia or row[idx_materia].strip().lower() != materia.strip().lower():
                continue
        total_filas_materia += 1
        for i, valor in enumerate(row[3:]):
            if i < len(preguntas):
                valor = valor.strip()
                if valor in opciones:
                    conteos[preguntas[i]][valor] += 1

    ef1_cols = set(_buscar_columna(preguntas, 5) + _buscar_columna(preguntas, 8) + _buscar_columna(preguntas, 13))
    ef4_cols = set(_buscar_columna(preguntas, 6))

    preguntas_detalle = []
    for numero in range(1, 24):
        cols = _buscar_columna(preguntas, numero)
        if not cols:
            # No se encontró columna para este número de pregunta en el CSV
            # actual (ej. cambió el formulario). Se reporta igual, vacío, en
            # vez de omitirla, para no romper el anexo de 23 preguntas.
            preguntas_detalle.append({
                'numero': numero,
                'texto': None,
                'es_ef1': False,
                'es_ef4': False,
                'conteos': {op: 0 for op in opciones},
                'total': 0,
            })
            continue

        col = cols[0]  # una sola columna por número de pregunta en el formulario real
        preguntas_detalle.append({
            'numero': numero,
            'texto': _texto_pregunta(col, numero),
            'es_ef1': col in ef1_cols,
            'es_ef4': col in ef4_cols,
            'conteos': conteos[col],
            'total': sum(conteos[col].values()),
        })

    return {
        'materia_filtrada': materia,
        'respuestas_totales_materia': total_filas_materia,
        'preguntas': preguntas_detalle,
    }


def _calcular_resultado_generico(evidencias_qs, materia_filtro, periodo=None):
    """
    Núcleo del cálculo EF1-EF5, parametrizado por:
    - evidencias_qs: queryset de Evidencia POR ASIGNATURA a considerar (solo
      cubre malla_curricular/syllabus/acta_retroalimentacion — evidencia que
      sí varía por materia).
    - materia_filtro: nombre de materia para filtrar la encuesta (una
      asignatura), o None para agregarla completa (evaluación general
      de la cohorte, tal como la evalúa CACES).
    - periodo: PeriodoAcademico del que se toma la evidencia INSTITUCIONAL
      (EF2/EF3/EF5 — acta_ajuste_curricular, evidencia_difusion,
      reglamento_normativa), que es la misma para todas las asignaturas de
      ese PAO. Si es None, EF2/EF3/EF5 quedan en "sin_datos".
    """
    evidencias_info = {
        'malla_curricular': {'subida': False, 'label': 'Malla Curricular'},
        'syllabus': {'subida': False, 'label': 'Syllabus'},
        'acta_retroalimentacion': {'subida': False, 'label': 'Acta de Retroalimentación'},
        'acta_ajuste_curricular': {'subida': False, 'label': 'Acta de Ajuste Curricular (EF2)'},
        'evidencia_difusion': {'subida': False, 'label': 'Evidencia de Difusión (EF3)'},
        'reglamento_normativa': {'subida': False, 'label': 'Reglamento / Normativa Institucional (EF5)'},
    }
    tipos_asignatura_vigentes = set(
        evidencias_qs.filter(vigente=True)
        .exclude(tipo__in=Evidencia.TIPOS_POR_PERIODO)
        .values_list('tipo', flat=True)
    )
    for tipo in tipos_asignatura_vigentes:
        if tipo in evidencias_info:
            evidencias_info[tipo]['subida'] = True

    if periodo is not None:
        tipos_periodo_vigentes = set(
            Evidencia.objects.filter(periodo_academico=periodo, vigente=True, tipo__in=Evidencia.TIPOS_POR_PERIODO)
            .values_list('tipo', flat=True)
        )
        for tipo in tipos_periodo_vigentes:
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

    # IMPORTANTE: cada EF documental se calcula de forma INDEPENDIENTE según
    # su propia evidencia — no se pone en None en bloque solo porque a otro
    # EF (o a la encuesta) le falte información. Antes, si por ejemplo faltaba
    # evidencia de EF5, el sistema también borraba el valor de EF2 y EF3 aunque
    # SÍ tuvieran su evidencia subida, y la UI terminaba mostrando "0%" en vez
    # de "Sin datos" (porque el estado decía "ok" pero el valor era None). Ver
    # sección 4 del documento de contexto: "si falta evidencia de un EF, el
    # sistema NO inventa un 0%, muestra Sin datos SOLO en ese EF puntual".
    ef2 = 1.0 if tiene_ef2 else None
    ef3_doc = 1.0 if tiene_ef3 else None
    ef5 = 1.0 if tiene_ef5 else None

    # El % agregado (resultado_final) ahora SIEMPRE se calcula, tratando
    # cada EF que falte como 0 en la suma ponderada — así una asignatura a
    # medio completar (ej. solo EF2/EF3/EF5 institucional) ya muestra un %
    # real de avance en vez de "Incompleto", sin inventar valor para lo que
    # falta (el "Sin datos" de cada EF puntual arriba se mantiene intacto
    # para saber exactamente qué falta). "estado_general" pasa a ser solo
    # informativo (si los 5 EF están completos o no), ya no bloquea el %.
    ef1_val = ef1 if ef1 is not None else 0.0
    ef2_val = ef2 if ef2 is not None else 0.0
    ef3_val = ef3_doc if ef3_doc is not None else 0.0
    ef4_val = ef4 if ef4 is not None else 0.0
    ef5_val = ef5 if ef5 is not None else 0.0

    ef_puntaje = round(ef1_val * 0.33 + ef2_val * 0.27 + ef3_val * 0.20 + ef4_val * 0.13 + ef5_val * 0.07, 4)
    valoracion_general = round(ef_puntaje * 100, 1)
    resultado_final = valoracion_general

    todos_completos = ef_disponible and ef2_estado == 'ok' and ef3_estado == 'ok' and ef5_estado == 'ok'
    estado_general = 'completo' if todos_completos else 'parcial'
    fuente_resultado = 'combinado' if todos_completos else 'parcial'

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
    Calcula el resultado EF1-EF5 para UNA asignatura: sus evidencias propias
    (malla/syllabus/acta_retro) + la evidencia institucional de su PAO
    (EF2/EF3/EF5), y la encuesta filtrada por su nombre de materia.
    """
    evidencias_qs = Evidencia.objects.filter(asignatura=asignatura)
    return _calcular_resultado_generico(
        evidencias_qs, materia_filtro=asignatura.nombre, periodo=asignatura.periodo_academico,
    )


def calcular_resultado_general(cohorte, periodo=None):
    """
    Calcula el resultado EF1-EF5 AGREGADO del PAO/cohorte promediando los
    resultados por asignatura. Cada EF ignora valores nulos antes de
    promediar; si un EF no tiene ningún dato disponible, queda en
    'sin_datos' y la valoración general se marca como incompleta.
    """
    asignaturas_qs = Asignatura.objects.filter(periodo_academico__cohorte=cohorte)
    if periodo is not None:
        asignaturas_qs = asignaturas_qs.filter(periodo_academico=periodo)

    resultados = [calcular_resultado_asignatura(asignatura) for asignatura in asignaturas_qs]

    # Evidencia propia de asignatura (malla/syllabus/acta_retro) + evidencia
    # institucional de los PAO involucrados (EF2/EF3/EF5, ya no depende de
    # la asignatura sino del periodo académico).
    asignatura_evidencias_qs = Evidencia.objects.filter(asignatura__in=asignaturas_qs, vigente=True)
    periodos_ids = list(asignaturas_qs.values_list('periodo_academico_id', flat=True).distinct())
    periodo_evidencias_qs = Evidencia.objects.filter(
        periodo_academico_id__in=periodos_ids, vigente=True, tipo__in=Evidencia.TIPOS_POR_PERIODO,
    )

    # IMPORTANTE: antes esto promediaba cada EF solo entre las asignaturas
    # que SÍ tenían dato, ignorando las que no — eso hacía que, con 1 sola
    # asignatura completa de 8, el general mostrara el resultado de ESA UNA
    # como si fuera el de todo el PAO (ej. 96% aunque las otras 7 no
    # tuvieran nada). Ahora se divide siempre entre el TOTAL de asignaturas
    # del PAO, tratando las que no tienen dato como 0 — así el general
    # queda diluido correctamente según cuántas asignaturas están
    # realmente completas.
    agregados = {}
    estados = {}
    total_resultados = len(resultados)
    for ef in ['ef1', 'ef2', 'ef3', 'ef4', 'ef5']:
        valores_todas = [(resultado[ef] if resultado[ef] is not None else 0.0) for resultado in resultados]
        agregados[ef] = round(sum(valores_todas) / total_resultados, 1) if total_resultados else None
        tiene_algun_dato = any(resultado[ef] is not None for resultado in resultados)
        estados[f'{ef}_estado'] = 'ok' if tiene_algun_dato else 'sin_datos'

    ef_disponible = any(resultado['ef_disponible'] for resultado in resultados)
    respuestas = sum(resultado['respuestas'] for resultado in resultados)
    promedio_general = round(
        sum(resultado['promedio_general'] for resultado in resultados if resultado['promedio_general'] is not None) /
        len([resultado for resultado in resultados if resultado['promedio_general'] is not None]),
        1,
    ) if any(resultado['promedio_general'] is not None for resultado in resultados) else 0

    total_asignaturas = asignaturas_qs.count()
    total_evidencias = asignatura_evidencias_qs.exclude(tipo__in=Evidencia.TIPOS_POR_PERIODO).count() + periodo_evidencias_qs.count()
    total_posible = (total_asignaturas * 3) + (len(periodos_ids) * 3)
    pct_evidencias = round(total_evidencias / total_posible * 100, 1) if total_posible > 0 else 0

    if total_resultados > 0:
        ef_puntaje = round(
            (agregados['ef1'] / 100) * 0.33 +
            (agregados['ef2'] / 100) * 0.27 +
            (agregados['ef3'] / 100) * 0.20 +
            (agregados['ef4'] / 100) * 0.13 +
            (agregados['ef5'] / 100) * 0.07,
            4,
        )
        valoracion_general = round(ef_puntaje * 100, 1)
        resultado_final = valoracion_general
        estado_general = 'completo' if all(r['estado_general'] == 'completo' for r in resultados) else 'parcial'
    else:
        ef_puntaje = None
        valoracion_general = None
        resultado_final = None
        estado_general = 'sin_datos'

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

    evidencias_info = {
        'malla_curricular': {'subida': asignatura_evidencias_qs.filter(tipo='malla_curricular').exists(), 'label': 'Malla Curricular'},
        'syllabus': {'subida': asignatura_evidencias_qs.filter(tipo='syllabus').exists(), 'label': 'Syllabus'},
        'acta_retroalimentacion': {'subida': asignatura_evidencias_qs.filter(tipo='acta_retroalimentacion').exists(), 'label': 'Acta de Retroalimentación'},
        'acta_ajuste_curricular': {'subida': periodo_evidencias_qs.filter(tipo='acta_ajuste_curricular').exists(), 'label': 'Acta de Ajuste Curricular (EF2)'},
        'evidencia_difusion': {'subida': periodo_evidencias_qs.filter(tipo='evidencia_difusion').exists(), 'label': 'Evidencia de Difusión (EF3)'},
        'reglamento_normativa': {'subida': periodo_evidencias_qs.filter(tipo='reglamento_normativa').exists(), 'label': 'Reglamento / Normativa Institucional (EF5)'},
    }

    return {
        'resultado_final': resultado_final,
        'valoracion_general': valoracion_general,
        'estado_general': estado_general,
        'escala': escala,
        'color_escala': color_escala,
        'fuente_resultado': 'agregado_por_asignatura',
        'dash': round(resultado_final * 3.393, 1) if resultado_final is not None else None,
        'evidencias_info': evidencias_info,
        'total_evidencias': total_evidencias,
        'pct_evidencias': pct_evidencias,
        'ef_disponible': ef_disponible,
        'ef1': agregados['ef1'],
        'ef1_estado': estados['ef1_estado'],
        'ef2': agregados['ef2'],
        'ef2_estado': estados['ef2_estado'],
        'ef3': agregados['ef3'],
        'ef3_estado': estados['ef3_estado'],
        'ef4': agregados['ef4'],
        'ef4_estado': estados['ef4_estado'],
        'ef5': agregados['ef5'],
        'ef5_estado': estados['ef5_estado'],
        'ef_puntaje': ef_puntaje,
        'respuestas': respuestas,
        'promedio_general': promedio_general,
    }