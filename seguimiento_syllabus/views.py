from django.shortcuts import render, redirect, get_object_or_404
from .models import Cohorte, Evidencia, PreguntaEncuesta, RespuestaEncuesta
import csv
import urllib.request
from django.http import JsonResponse
import re


def _buscar_columna(preguntas, numero):
    """
    Busca columnas del CSV de Google Forms por número de pregunta.
    Maneja [P5] y [P5. texto...] porque Google Forms incluye el texto de la pregunta.
    """
    patron = re.compile(rf'\[P{numero}[\.\]]', re.IGNORECASE)
    return [p for p in preguntas if patron.search(p)]


def _calcular_ef_desde_csv():
    """
    Lee el CSV de Google Sheets y devuelve los valores de EF1, EF3, EF4
    como decimales 0-1, más el puntaje ponderado total.
    Retorna None si no se puede conectar.
    """
    URL_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSS9YX0N26YnO5pUAYc2U7JchenIAEasrpq0gs79Up0fOLrayn6JX-FmuolcXSkIL0MReJ7j0jpXPtC/pub?output=csv"
    puntaje_map = {"Siempre": 5, "Casi siempre": 4, "Algunas veces": 3, "Pocas veces": 2, "Nunca": 1}

    try:
        req = urllib.request.Request(URL_CSV, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req, timeout=10)
        lines = [l.decode("utf-8") for l in response.readlines()]
    except Exception:
        return None

    reader = csv.reader(lines)
    headers = next(reader)
    preguntas = headers[3:]

    totales = {p: 0 for p in preguntas}
    conteos = {p: 0 for p in preguntas}
    total_filas = 0

    for row in reader:
        if len(row) < 4:
            continue
        total_filas += 1
        for i, valor in enumerate(row[3:]):
            if i < len(preguntas) and valor.strip() in puntaje_map:
                totales[preguntas[i]] += puntaje_map[valor.strip()]
                conteos[preguntas[i]] += 1

    promedios = {}
    for p in preguntas:
        if conteos[p] > 0:
            promedios[p] = round((totales[p] / conteos[p] / 5) * 100, 1)
        else:
            promedios[p] = 0

    ef1_pregs = _buscar_columna(preguntas, 5) + _buscar_columna(preguntas, 8)
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
    ef2 = 0.72  # fijo hasta conectar con actas
    ef5 = 0.68  # fijo hasta conectar con normativa

    ef_puntaje = round(ef1*0.33 + ef2*0.27 + ef3*0.20 + ef4*0.13 + ef5*0.07, 2)

    return {
        'ef1': ef1, 'ef2': ef2, 'ef3': ef3, 'ef4': ef4, 'ef5': ef5,
        'ef_puntaje': ef_puntaje,
        'respuestas': total_filas,
        'promedio_general': round(sum(promedios.values()) / len(promedios), 1) if promedios else 0,
    }


def resultado(request):
    cohortes = Cohorte.objects.all()
    cohorte_id = request.GET.get('cohorte')
    cohorte_actual = None

    # Datos de evidencias
    evidencias_info = {
        'malla':    {'subida': False, 'label': 'Malla Curricular',          'ef': 'EF2'},
        'syllabus': {'subida': False, 'label': 'Syllabus',                  'ef': 'EF2'},
        'acta':     {'subida': False, 'label': 'Acta de Retroalimentación', 'ef': 'EF2'},
    }
    total_evidencias = 0

    if cohorte_id:
        cohorte_actual = get_object_or_404(Cohorte, id=cohorte_id)
        evidencias_qs = Evidencia.objects.filter(cohorte=cohorte_actual)
        total_evidencias = evidencias_qs.count()
        for ev in evidencias_qs:
            if ev.tipo in evidencias_info:
                evidencias_info[ev.tipo]['subida'] = True

    pct_evidencias = round(total_evidencias / 3 * 100, 1) if total_evidencias > 0 else 0

    # Datos de heteroevaluación (desde Google Sheets)
    datos_ef = _calcular_ef_desde_csv()
    ef_disponible = datos_ef is not None

    if ef_disponible:
        ef1 = datos_ef['ef1']
        ef2 = datos_ef['ef2']
        ef3 = datos_ef['ef3']
        ef4 = datos_ef['ef4']
        ef5 = datos_ef['ef5']
        ef_puntaje = datos_ef['ef_puntaje']
        respuestas = datos_ef['respuestas']
        promedio_general = datos_ef['promedio_general']
    else:
        ef1 = ef2 = ef3 = ef4 = ef5 = ef_puntaje = 0.0
        respuestas = 0
        promedio_general = 0

    # Resultado combinado:
    # Si hay datos de EF → usar ef_puntaje × 100 como resultado principal
    # Si no hay datos de EF → usar solo porcentaje de evidencias
    if ef_disponible and ef_puntaje > 0:
        resultado_final = round(ef_puntaje * 100, 1)
        fuente_resultado = 'combinado'
    else:
        resultado_final = pct_evidencias
        fuente_resultado = 'solo_evidencias'

    if resultado_final >= 75:
        escala = 'Satisfactorio'
        color_escala = '#15803D'
    elif resultado_final >= 50:
        escala = 'Cuasi Satisfactorio'
        color_escala = '#CA8A04'
    elif resultado_final >= 25:
        escala = 'Poco Satisfactorio'
        color_escala = '#F97316'
    else:
        escala = 'Deficiente'
        color_escala = '#EF4444'

    return render(request, 'seguimiento_syllabus/resultado.html', {
        'cohortes': cohortes,
        'cohorte_actual': cohorte_actual,
        # Resultado principal
        'resultado_final': resultado_final,
        'escala': escala,
        'color_escala': color_escala,
        'fuente_resultado': fuente_resultado,
        # Evidencias
        'evidencias_info': evidencias_info,
        'total_evidencias': total_evidencias,
        'pct_evidencias': pct_evidencias,
        # EFs
        'ef_disponible': ef_disponible,
        'ef1': round(ef1 * 100, 1),
        'ef2': round(ef2 * 100, 1),
        'ef3': round(ef3 * 100, 1),
        'ef4': round(ef4 * 100, 1),
        'ef5': round(ef5 * 100, 1),
        'ef_puntaje': ef_puntaje,
        'respuestas': respuestas,
        'promedio_general': promedio_general,
    })


def evidencias(request):
    cohortes = Cohorte.objects.all()
    cohorte_id = request.GET.get('cohorte')
    cohorte_actual = None
    evidencias_cargadas = []

    if cohorte_id:
        cohorte_actual = get_object_or_404(Cohorte, id=cohorte_id)
        evidencias_cargadas = Evidencia.objects.filter(cohorte=cohorte_actual)

    if request.method == 'POST':
        tipo = request.POST.get('tipo')
        archivo = request.FILES.get('archivo')
        cohorte_actual = get_object_or_404(Cohorte, id=request.POST.get('cohorte_id'))
        Evidencia.objects.create(cohorte=cohorte_actual, tipo=tipo, archivo=archivo)
        return redirect(f'/evidencias/?cohorte={cohorte_actual.id}')

    return render(request, 'seguimiento_syllabus/evidencias.html', {
        'cohortes': cohortes,
        'cohorte_actual': cohorte_actual,
        'evidencias_cargadas': evidencias_cargadas,
        'total': evidencias_cargadas.count() if cohorte_actual else 0,
    })


def cohortes(request):
    cohortes = Cohorte.objects.all()
    if request.method == 'POST':
        nombre = request.POST.get('nombre')
        Cohorte.objects.create(nombre=nombre)
        return redirect('/cohortes/')
    return render(request, 'seguimiento_syllabus/cohortes.html', {
        'cohortes': cohortes,
    })


def encuesta(request):
    preguntas = PreguntaEncuesta.objects.all().order_by('orden')
    cohortes = Cohorte.objects.all()
    return render(request, 'seguimiento_syllabus/encuesta.html', {
        'preguntas': preguntas,
        'cohortes': cohortes,
    })


def ficha_tecnica(request):
    return render(request, 'seguimiento_syllabus/ficha_tecnica.html')


def calcular_resultados_encuesta(request):
    URL_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSS9YX0N26YnO5pUAYc2U7JchenIAEasrpq0gs79Up0fOLrayn6JX-FmuolcXSkIL0MReJ7j0jpXPtC/pub?output=csv"
    puntaje_map = {"Siempre": 5, "Casi siempre": 4, "Algunas veces": 3, "Pocas veces": 2, "Nunca": 1}

    try:
        req = urllib.request.Request(URL_CSV, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req, timeout=10)
        lines = [l.decode("utf-8") for l in response.readlines()]
    except Exception as e:
        error_msg = f"No se pudo conectar con Google Sheets: {e}"
        if request.GET.get('formato') == 'json':
            return JsonResponse({'error': error_msg}, status=503)
        return render(request, "seguimiento_syllabus/encuesta_resultados.html", {'error': error_msg})

    reader = csv.reader(lines)
    headers = next(reader)
    preguntas = headers[3:]

    totales = {p: 0 for p in preguntas}
    conteos = {p: 0 for p in preguntas}
    total_filas = 0

    for row in reader:
        if len(row) < 4:
            continue
        total_filas += 1
        for i, valor in enumerate(row[3:]):
            if i < len(preguntas) and valor.strip() in puntaje_map:
                totales[preguntas[i]] += puntaje_map[valor.strip()]
                conteos[preguntas[i]] += 1

    promedios = {}
    for p in preguntas:
        if conteos[p] > 0:
            promedios[p] = round((totales[p] / conteos[p] / 5) * 100, 1)
        else:
            promedios[p] = 0

    promedio_general = round(sum(promedios.values()) / len(promedios), 1) if promedios else 0

    ef1_pregs = _buscar_columna(preguntas, 5) + _buscar_columna(preguntas, 8)
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
    ef2 = 0.00
    ef5 = 0.00

    ef_puntaje = round(ef1*0.33 + ef2*0.27 + ef3*0.20 + ef4*0.13 + ef5*0.07, 2)

    if promedio_general >= 75:
        escala = "Satisfactorio"
    elif promedio_general >= 50:
        escala = "Cuasi Satisfactorio"
    elif promedio_general >= 25:
        escala = "Poco Satisfactorio"
    else:
        escala = "Deficiente"

    if request.GET.get('formato') == 'json':
        return JsonResponse({
            'respuestas': total_filas,
            'promedio_general': promedio_general,
            'ef_puntaje': ef_puntaje,
            'ef1': ef1, 'ef2': ef2, 'ef3': ef3, 'ef4': ef4, 'ef5': ef5,
            'columnas_detectadas': {
                'ef1': ef1_pregs, 'ef3': ef3_pregs, 'ef4': ef4_pregs,
            },
            'promedios': promedios,
        })

    return render(request, "seguimiento_syllabus/encuesta_resultados.html", {
        "promedios": promedios,
        "promedio_general": promedio_general,
        "escala": escala,
        "total_filas": total_filas,
        "ef1": ef1, "ef2": ef2, "ef3": ef3, "ef4": ef4, "ef5": ef5,
        "ef_puntaje": ef_puntaje,
    })