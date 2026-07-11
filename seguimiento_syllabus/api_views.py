from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.db import models

from .models import Carrera, Cohorte, PeriodoAcademico, Asignatura, Evidencia
from .serializers import (
    CarreraSerializer,
    CohorteSerializer,
    PeriodoAcademicoSerializer,
    AsignaturaSerializer,
    EvidenciaSerializer,
)
# Reutilizamos la lógica de negocio centralizada en views.py; no se duplica.
from .views import (  # noqa: F401
    _calcular_ef_desde_csv,
    calcular_resultado_asignatura, calcular_resultado_general,
    obtener_materias_disponibles,
    obtener_detalle_encuesta,
)


# ---------- Cohortes ----------

@api_view(['GET', 'POST'])
def api_cohortes(request):
    if request.method == 'POST':
        nombre = request.data.get('nombre')
        if not nombre:
            return Response({'error': 'El campo "nombre" es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        # Cohorte.carrera ahora es obligatorio (ver Carrera en models.py).
        # El frontend actual no manda "carrera_id" todavía (solo se trabaja
        # con "Desarrollo de Software"), así que si no viene, se usa esa
        # carrera por default en vez de romper la creación — cuando se
        # agreguen más carreras, el frontend puede empezar a mandar
        # "carrera_id" sin necesitar otro cambio de backend.
        carrera_id = request.data.get('carrera_id') or request.data.get('carrera')
        if carrera_id:
            carrera = get_object_or_404(Carrera, id=carrera_id)
        else:
            carrera, _ = Carrera.objects.get_or_create(nombre='Desarrollo de Software')

        cohorte = Cohorte.objects.create(nombre=nombre, carrera=carrera)
        return Response(CohorteSerializer(cohorte).data, status=status.HTTP_201_CREATED)

    cohortes_qs = Cohorte.objects.all()
    carrera_id = request.GET.get('carrera')
    if carrera_id:
        cohortes_qs = cohortes_qs.filter(carrera_id=carrera_id)
    return Response(CohorteSerializer(cohortes_qs, many=True).data)


# ---------- Carreras ----------

@api_view(['GET'])
def api_carreras(request):
    """
    Lista las Carrera existentes. Hoy solo va a devolver 1 fila
    ("Desarrollo de Software"), pero el endpoint ya existe para cuando se
    agreguen las demás carreras del TEC (no hace falta otra migración de
    API para eso, solo empezar a poblar más filas).
    """
    carreras = Carrera.objects.all()
    return Response(CarreraSerializer(carreras, many=True).data)


# ---------- Periodos académicos ----------

@api_view(['GET'])
def api_periodos(request):
    cohorte_id = request.GET.get('cohorte')
    periodos_qs = PeriodoAcademico.objects.all()
    if cohorte_id:
        periodos_qs = periodos_qs.filter(cohorte_id=cohorte_id)
    return Response(PeriodoAcademicoSerializer(periodos_qs, many=True).data)


def _obtener_periodo_por_cohorte(cohorte):
    periodo, _ = PeriodoAcademico.objects.get_or_create(
        cohorte=cohorte,
        nombre='PAO 1',
        defaults={'orden': 1},
    )
    return periodo


# ---------- Asignaturas ----------

@api_view(['GET', 'POST'])
def api_asignaturas(request):
    if request.method == 'POST':
        nombre = request.data.get('nombre')
        periodo_id = request.data.get('periodo_id') or request.data.get('periodo')
        cohorte_id = request.data.get('cohorte_id') or request.data.get('cohorte')
        docente = request.data.get('docente', '')

        if not nombre:
            return Response(
                {'error': 'Se requiere el campo "nombre".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        periodo = None
        if periodo_id:
            periodo = get_object_or_404(PeriodoAcademico, id=periodo_id)
        elif cohorte_id:
            cohorte = get_object_or_404(Cohorte, id=cohorte_id)
            periodo = _obtener_periodo_por_cohorte(cohorte)
        else:
            return Response(
                {'error': 'Se requiere "periodo_id" o "cohorte_id".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        asignatura = Asignatura.objects.create(periodo_academico=periodo, nombre=nombre, docente=docente)
        return Response(AsignaturaSerializer(asignatura).data, status=status.HTTP_201_CREATED)

    cohorte_id = request.GET.get('cohorte')
    periodo_id = request.GET.get('periodo')
    asignaturas_qs = Asignatura.objects.all()
    if periodo_id:
        asignaturas_qs = asignaturas_qs.filter(periodo_academico_id=periodo_id)
    if cohorte_id:
        asignaturas_qs = asignaturas_qs.filter(periodo_academico__cohorte_id=cohorte_id)

    return Response(AsignaturaSerializer(asignaturas_qs, many=True).data)


@api_view(['GET'])
def api_materias_encuesta(request):
    """
    Lista los nombres de 'Materia' detectados en las respuestas de la
    encuesta (Google Forms). Útil para que, al crear una Asignatura, el
    nombre coincida exactamente con lo que contestan los estudiantes.
    """
    return Response({'materias': obtener_materias_disponibles()})


# ---------- Evidencias (ahora por asignatura) ----------

@api_view(['GET', 'POST'])
@parser_classes([MultiPartParser, FormParser])
def api_evidencias(request):
    if request.method == 'POST':
        tipo = request.data.get('tipo')
        data = request.data.copy()

        # El frontend SIEMPRE manda "asignatura" (la que tiene seleccionada
        # en pantalla), sin importar el nivel real del tipo de evidencia —
        # el backend deriva desde ahí tanto el PeriodoAcademico como la
        # Carrera (asignatura -> periodo_academico -> cohorte -> carrera),
        # así el flujo de subida en la UI no cambia aunque el nivel de un
        # tipo de evidencia cambie en el futuro.
        asignatura_id = data.get('asignatura_id') or data.get('asignatura')
        if not asignatura_id:
            return Response(
                {'error': 'Se requiere "asignatura_id".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        asignatura = get_object_or_404(Asignatura, id=asignatura_id)
        carrera_id = asignatura.periodo_academico.cohorte.carrera_id

        data.pop('asignatura', None)
        data.pop('asignatura_id', None)
        data.pop('periodo_academico', None)
        data.pop('periodo_id', None)
        data.pop('carrera', None)

        if tipo in Evidencia.TIPOS_POR_CARRERA:
            # malla_curricular / reglamento_normativa (EF5): evidencia de
            # TODA la carrera — se guarda sin asignatura ni periodo.
            data['carrera'] = str(carrera_id)
        elif tipo in Evidencia.TIPOS_POR_PERIODO:
            # Hoy ningún tipo cae acá (ver TIPOS_POR_PERIODO en models.py),
            # se deja implementado por si a futuro EF4 suma evidencia
            # documental propia de nivel PAO.
            data['periodo_academico'] = str(asignatura.periodo_academico_id)
        else:
            # syllabus / acta_retroalimentacion / acta_ajuste_curricular
            # (EF2) / evidencia_difusion (EF3): nivel asignatura, sin cambios.
            data['asignatura'] = str(asignatura.id)

        serializer = EvidenciaSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            # IMPORTANTE: forzamos vigente=True explícitamente en save().
            # Motivo: el frontend sube evidencia como multipart/form-data (FormData)
            # y nunca manda el campo "vigente". Django REST Framework trata los
            # BooleanField de datos tipo formulario HTML con su propio
            # "default_empty_html", que para BooleanField es False (misma lógica
            # que un checkbox sin marcar) — NO usa el default=True del modelo.
            # Sin este override, toda evidencia nueva quedaba guardada con
            # vigente=False, y como _calcular_resultado_generico() en views.py
            # filtra evidencias_qs.filter(vigente=True), esas evidencias nunca se
            # contaban para EF2/EF3/EF5. Por eso "Resultados" nunca reflejaba las
            # evidencias recién subidas, aunque en la pestaña "Evidencias" sí se
            # vieran como "Cargado ✓" (esa vista no filtra por vigente).
            serializer.save(vigente=True)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    asignatura_id = request.GET.get('asignatura')
    periodo_id = request.GET.get('periodo')
    evidencias_qs = Evidencia.objects.all()

    if asignatura_id:
        # Devolvemos la unión: evidencia propia de la asignatura (syllabus,
        # acta_retroalimentacion, acta_ajuste_curricular EF2, evidencia_difusion
        # EF3) + evidencia de la CARRERA a la que pertenece esa asignatura
        # (malla_curricular, reglamento_normativa EF5), derivada de la misma
        # cadena asignatura -> periodo_academico -> cohorte -> carrera — así
        # la pestaña Evidencias muestra ambas sin que el frontend tenga que
        # pedir 2 veces.
        asignatura = get_object_or_404(Asignatura, id=asignatura_id)
        carrera_id = asignatura.periodo_academico.cohorte.carrera_id
        evidencias_qs = evidencias_qs.filter(
            models.Q(asignatura_id=asignatura_id) |
            models.Q(carrera_id=carrera_id, tipo__in=Evidencia.TIPOS_POR_CARRERA)
        )
    elif periodo_id:
        evidencias_qs = evidencias_qs.filter(periodo_academico_id=periodo_id)

    return Response({
        'total': evidencias_qs.count(),
        'evidencias': EvidenciaSerializer(evidencias_qs, many=True, context={'request': request}).data,
    })


# ---------- Resultado (EF1-EF5) por asignatura ----------

@api_view(['GET'])
def api_resultado(request):
    asignatura_id = request.GET.get('asignatura')
    if not asignatura_id:
        return Response({'error': 'Se requiere el parámetro "asignatura".'}, status=status.HTTP_400_BAD_REQUEST)

    asignatura = get_object_or_404(Asignatura, id=asignatura_id)
    resultado = calcular_resultado_asignatura(asignatura)
    resultado['asignatura'] = AsignaturaSerializer(asignatura).data
    return Response(resultado)


# ---------- Resultado GENERAL de la cohorte (como lo evalúa CACES: todas las
# evidencias + toda la encuesta juntas, sin separar por asignatura) ----------

@api_view(['GET'])
def api_resultado_cohorte(request):
    cohorte_id = request.GET.get('cohorte')
    periodo_id = request.GET.get('periodo')

    periodo = None
    if periodo_id:
        periodo = get_object_or_404(PeriodoAcademico, id=periodo_id)
        if cohorte_id and str(periodo.cohorte_id) != str(cohorte_id):
            return Response({'error': 'El período no pertenece a la cohorte indicada.'}, status=status.HTTP_400_BAD_REQUEST)
        cohorte = periodo.cohorte
    else:
        if not cohorte_id:
            return Response({'error': 'Se requiere el parámetro "cohorte".'}, status=status.HTTP_400_BAD_REQUEST)
        cohorte = get_object_or_404(Cohorte, id=cohorte_id)

    resultado = calcular_resultado_general(cohorte, periodo=periodo)
    resultado['cohorte'] = CohorteSerializer(cohorte).data
    if periodo:
        resultado['periodo'] = PeriodoAcademicoSerializer(periodo).data

    # Además, incluimos el detalle por asignatura (útil para la lista lateral
    # del frontend, mostrando el % de cada una junto al general).
    asignaturas = Asignatura.objects.filter(periodo_academico__cohorte=cohorte)
    if periodo:
        asignaturas = asignaturas.filter(periodo_academico=periodo)
    detalle_asignaturas = []
    for asignatura in asignaturas:
        r = calcular_resultado_asignatura(asignatura)
        detalle_asignaturas.append({
            'asignatura': AsignaturaSerializer(asignatura).data,
            'resultado_final': r['resultado_final'],
            'escala': r['escala'],
            'color_escala': r['color_escala'],
        })
    resultado['asignaturas'] = detalle_asignaturas

    return Response(resultado)


# ---------- Encuesta ----------

@api_view(['GET'])
def api_encuesta(request):
    cohorte_id = request.GET.get('cohorte')
    cohorte_actual = None
    if cohorte_id:
        cohorte_actual = get_object_or_404(Cohorte, id=cohorte_id)

    return Response({
        'preguntas': [],
        'cohorte_actual': CohorteSerializer(cohorte_actual).data if cohorte_actual else None,
    })


@api_view(['GET'])
def api_encuesta_resultados(request):
    materia = request.GET.get('materia')
    datos = _calcular_ef_desde_csv(materia=materia)
    if datos is None:
        return Response({'error': 'No se pudo conectar con Google Sheets.'}, status=503)
    return Response(datos)


# ---------- Detalle de encuesta por asignatura (Entrega 3 - Exportación PDF) ----------

@api_view(['GET'])
def api_encuesta_detalle(request):
    """
    Devuelve, para las 23 preguntas de la encuesta de heteroevaluación, el
    texto completo y el desglose de respuestas (conteo por opción),
    filtrado por la materia de la asignatura indicada. Usado por el PDF
    (secciones "Detalle de encuesta" y "Anexo") para no depender de texto
    hardcodeado en el frontend.
    """
    asignatura_id = request.GET.get('asignatura')
    if not asignatura_id:
        return Response({'error': 'Se requiere el parámetro "asignatura".'}, status=status.HTTP_400_BAD_REQUEST)

    asignatura = get_object_or_404(Asignatura, id=asignatura_id)
    detalle = obtener_detalle_encuesta(materia=asignatura.nombre)
    if detalle is None:
        return Response({'error': 'No se pudo conectar con Google Sheets.'}, status=503)

    detalle['asignatura'] = asignatura.id
    return Response(detalle)


# ---------- Ficha técnica ----------

@api_view(['GET'])
def api_ficha_tecnica(request):
    return Response({'detalle': 'Ficha técnica del indicador 11.2 - Prácticas UCSG TEC.'})