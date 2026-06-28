from django.shortcuts import render, redirect, get_object_or_404
from .models import Cohorte, Evidencia, PreguntaEncuesta, RespuestaEncuesta
import csv
import urllib.request
from django.http import JsonResponse
import re  # agregar arriba del archivo si no está



def resultado(request):
    cohortes = Cohorte.objects.all()
    cohorte_id = request.GET.get('cohorte')
    cohorte_actual = None
    porcentaje = None
    escala = None

    if cohorte_id:
        cohorte_actual = get_object_or_404(Cohorte, id=cohorte_id)
        total = Evidencia.objects.filter(cohorte=cohorte_actual).count()
        porcentaje = round((total / 3 * 100), 1) if total > 0 else 0

        if porcentaje >= 75:
            escala = 'Satisfactorio'
        elif porcentaje >= 50:
            escala = 'Cuasi Satisfactorio'
        elif porcentaje >= 25:
            escala = 'Poco Satisfactorio'
        else:
            escala = 'Deficiente'

    return render(request, 'seguimiento_syllabus/resultado.html', {
        'cohortes': cohortes,
        'cohorte_actual': cohorte_actual,
        'porcentaje': porcentaje,
        'escala': escala,
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



def _buscar_columna(preguntas, numero):
    """
    Busca columnas del CSV de Google Forms por número de pregunta.
    Maneja [P5] y [P5. texto...] porque Google Forms incluye el texto de la pregunta.
    """
    patron = re.compile(rf'\[P{numero}[\.\]]', re.IGNORECASE)
    return [p for p in preguntas if patron.search(p)]


def calcular_resultados_encuesta(request):
    URL_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSS9YX0N26YnO5pUAYc2U7JchenIAEasrpq0gs79Up0fOLrayn6JX-FmuolcXSkIL0MReJ7j0jpXPtC/pub?output=csv"

    puntaje = {"Siempre": 5, "Casi siempre": 4, "Algunas veces": 3, "Pocas veces": 2, "Nunca": 1}

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
            if i < len(preguntas) and valor.strip() in puntaje:
                totales[preguntas[i]] += puntaje[valor.strip()]
                conteos[preguntas[i]] += 1

    # Promedios por pregunta en escala 0-100
    promedios = {}
    for p in preguntas:
        if conteos[p] > 0:
            promedios[p] = round((totales[p] / conteos[p] / 5) * 100, 1)
        else:
            promedios[p] = 0

    promedio_general = round(sum(promedios.values()) / len(promedios), 1) if promedios else 0

    # Búsqueda robusta de columnas por EF
    ef1_pregs = _buscar_columna(preguntas, 5) + _buscar_columna(preguntas, 8)
    ef3_pregs = _buscar_columna(preguntas, 7)
    ef4_pregs = _buscar_columna(preguntas, 6)

    def promedio_ef_decimal(preg_list):
        """Devuelve promedio como decimal 0-1 (lo que espera el JS del template)."""
        vals = [promedios[p] for p in preg_list if p in promedios]
        if not vals:
            return 0.0
        return round(sum(vals) / len(vals) / 100, 4)

    ef1 = promedio_ef_decimal(ef1_pregs)   # ej: 0.904
    ef3 = promedio_ef_decimal(ef3_pregs)   # ej: 0.904
    ef4 = promedio_ef_decimal(ef4_pregs)   # ej: 0.904

    # EF2 y EF5: valores fijos hasta conectar con datos reales
    ef2 = 0.72
    ef5 = 0.68

    # Puntaje ponderado total (también en decimal 0-1, igual que ef1/ef3/ef4)
    ef_puntaje = round(
        ef1 * 0.33 +
        ef2 * 0.27 +
        ef3 * 0.20 +
        ef4 * 0.13 +
        ef5 * 0.07,
        2
    )

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
            # Métricas principales (lo que muestra el JS en encuesta.html)
            'respuestas': total_filas,
            'promedio_general': promedio_general,   # ej: 90.4  (sin dividir entre 20)
            'ef_puntaje': ef_puntaje,               # ej: 0.81  (decimal 0-1, igual que ef1/ef3/ef4)

            # Valores por EF en decimal 0-1 (el JS hace valor*100 para el ancho de barra)
            'ef1': ef1,   # ej: 0.904
            'ef2': ef2,   # 0.72 fijo
            'ef3': ef3,   # ej: 0.904
            'ef4': ef4,   # ej: 0.904
            'ef5': ef5,   # 0.68 fijo

            # Debug: columnas detectadas en el CSV
            'columnas_detectadas': {
                'ef1': ef1_pregs,
                'ef3': ef3_pregs,
                'ef4': ef4_pregs,
            },
            'promedios': promedios,
        })

    return render(request, "seguimiento_syllabus/encuesta_resultados.html", {
        "promedios": promedios,
        "promedio_general": promedio_general,
        "escala": escala,
        "total_filas": total_filas,
        "ef1": ef1,
        "ef2": ef2,
        "ef3": ef3,
        "ef4": ef4,
        "ef5": ef5,
        "ef_puntaje": ef_puntaje,
    })