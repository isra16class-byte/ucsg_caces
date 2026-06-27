from django.shortcuts import render, redirect
from .models import Cohorte, Evidencia, PreguntaEncuesta, RespuestaEncuesta
import csv
import urllib.request
import json
from django.http import JsonResponse

def resultado(request):
    cohortes = Cohorte.objects.all()
    cohorte_id = request.GET.get('cohorte')
    cohorte_actual = None
    porcentaje = None
    escala = None

    if cohorte_id:
        cohorte_actual = Cohorte.objects.get(id=cohorte_id)
        total = Evidencia.objects.filter(cohorte=cohorte_actual).count()
        porcentaje = (total / 3 * 100) if total > 0 else 0

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
        cohorte_actual = Cohorte.objects.get(id=cohorte_id)
        evidencias_cargadas = Evidencia.objects.filter(cohorte=cohorte_actual)

    if request.method == 'POST':
        tipo = request.POST.get('tipo')
        archivo = request.FILES.get('archivo')
        cohorte_actual = Cohorte.objects.get(id=request.POST.get('cohorte_id'))
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
    
    puntaje = {"Siempre": 5, "Casi siempre": 4, "Algunas veces": 3, "Pocas veces": 2, "Nunca": 1}
    
    response = urllib.request.urlopen(URL_CSV)
    lines = [l.decode("utf-8") for l in response.readlines()]
    reader = csv.reader(lines)
    
    headers = next(reader)
    preguntas = headers[3:]
    
    totales = {p: 0 for p in preguntas}
    conteos = {p: 0 for p in preguntas}
    total_filas = 0
    
    for row in reader:
        total_filas += 1
        for i, valor in enumerate(row[3:]):
            if valor in puntaje:
                totales[preguntas[i]] += puntaje[valor]
                conteos[preguntas[i]] += 1
    
    promedios = {}
    for p in preguntas:
        if conteos[p] > 0:
            promedios[p] = round((totales[p] / conteos[p] / 5) * 100, 1)
        else:
            promedios[p] = 0
    
    promedio_general = round(sum(promedios.values()) / len(promedios), 1) if promedios else 0
    promedio_escala = round(promedio_general / 20, 2)

    # Calcular por secciones para los EF
    # EF1: P5, P8 (seguimiento contenidos)
    ef1_pregs = [p for p in preguntas if '[P5]' in p or '[P8]' in p]
    ef3_pregs = [p for p in preguntas if '[P7]' in p]
    ef4_pregs = [p for p in preguntas if '[P6]' in p]

    def promedio_ef(preg_list):
        vals = [promedios.get(p, 0) for p in preg_list if p in promedios]
        return round(sum(vals) / len(vals) / 100, 2) if vals else 0

    ef1 = promedio_ef(ef1_pregs)
    ef3 = promedio_ef(ef3_pregs)
    ef4 = promedio_ef(ef4_pregs)
    ef_puntaje = round(ef1 * 0.33 + ef3 * 0.20 + ef4 * 0.13, 2)

    if request.GET.get('formato') == 'json':
        return JsonResponse({
            'respuestas': total_filas,
            'promedio_general': round(promedio_general / 20, 1),
            'ef_puntaje': ef_puntaje,
            'ef1': ef1,
            'ef3': ef3,
            'ef4': ef4,
            'promedios': promedios,
        })

    if promedio_general >= 75:
        escala = "Satisfactorio"
    elif promedio_general >= 50:
        escala = "Cuasi Satisfactorio"
    elif promedio_general >= 25:
        escala = "Poco Satisfactorio"
    else:
        escala = "Deficiente"
    
    return render(request, "seguimiento_syllabus/encuesta_resultados.html", {
        "promedios": promedios,
        "promedio_general": promedio_general,
        "escala": escala,
    })