from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404

from .models import Cohorte, Asignatura, Evidencia, PreguntaEncuesta, RespuestaEncuesta
from .serializers import (
    CohorteSerializer, AsignaturaSerializer, EvidenciaSerializer,
    PreguntaEncuestaSerializer, RespuestaEncuestaSerializer,
)
# Reutilizamos la lógica de negocio centralizada en views.py; no se duplica.
from .views import (  # noqa: F401
    _calcular_ef_desde_csv, _buscar_columna,
    calcular_resultado_asignatura, obtener_materias_disponibles,
)


# ---------- Cohortes ----------

@api_view(['GET', 'POST'])
def api_cohortes(request):
    if request.method == 'POST':
        nombre = request.data.get('nombre')
        if not nombre:
            return Response({'error': 'El campo "nombre" es requerido.'}, status=status.HTTP_400_BAD_REQUEST)
        cohorte = Cohorte.objects.create(nombre=nombre)
        return Response(CohorteSerializer(cohorte).data, status=status.HTTP_201_CREATED)

    cohortes = Cohorte.objects.all()
    return Response(CohorteSerializer(cohortes, many=True).data)


# ---------- Asignaturas ----------

@api_view(['GET', 'POST'])
def api_asignaturas(request):
    if request.method == 'POST':
        nombre = request.data.get('nombre')
        cohorte_id = request.data.get('cohorte_id') or request.data.get('cohorte')
        docente = request.data.get('docente', '')

        if not (nombre and cohorte_id):
            return Response(
                {'error': 'Se requieren "nombre" y "cohorte_id".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cohorte = get_object_or_404(Cohorte, id=cohorte_id)
        asignatura = Asignatura.objects.create(cohorte=cohorte, nombre=nombre, docente=docente)
        return Response(AsignaturaSerializer(asignatura).data, status=status.HTTP_201_CREATED)

    cohorte_id = request.GET.get('cohorte')
    asignaturas_qs = Asignatura.objects.all()
    if cohorte_id:
        asignaturas_qs = asignaturas_qs.filter(cohorte_id=cohorte_id)

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
        archivo = request.FILES.get('archivo')
        asignatura_id = request.data.get('asignatura_id') or request.data.get('asignatura')

        if not (tipo and archivo and asignatura_id):
            return Response(
                {'error': 'Se requieren "tipo", "archivo" y "asignatura_id".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        asignatura = get_object_or_404(Asignatura, id=asignatura_id)
        evidencia = Evidencia.objects.create(asignatura=asignatura, tipo=tipo, archivo=archivo)
        return Response(
            EvidenciaSerializer(evidencia, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    asignatura_id = request.GET.get('asignatura')
    evidencias_qs = Evidencia.objects.all()
    if asignatura_id:
        evidencias_qs = evidencias_qs.filter(asignatura_id=asignatura_id)

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


# ---------- Resultado agregado de toda la cohorte (promedio de asignaturas) ----------

@api_view(['GET'])
def api_resultado_cohorte(request):
    cohorte_id = request.GET.get('cohorte')
    if not cohorte_id:
        return Response({'error': 'Se requiere el parámetro "cohorte".'}, status=status.HTTP_400_BAD_REQUEST)

    cohorte = get_object_or_404(Cohorte, id=cohorte_id)
    asignaturas = Asignatura.objects.filter(cohorte=cohorte)

    resultados = []
    for asignatura in asignaturas:
        r = calcular_resultado_asignatura(asignatura)
        resultados.append({
            'asignatura': AsignaturaSerializer(asignatura).data,
            'resultado_final': r['resultado_final'],
            'escala': r['escala'],
            'color_escala': r['color_escala'],
        })

    promedio = round(sum(r['resultado_final'] for r in resultados) / len(resultados), 1) if resultados else 0

    return Response({
        'cohorte': CohorteSerializer(cohorte).data,
        'promedio_general': promedio,
        'asignaturas': resultados,
    })


# ---------- Encuesta ----------

@api_view(['GET'])
def api_encuesta(request):
    preguntas = PreguntaEncuesta.objects.all().order_by('orden')
    cohorte_id = request.GET.get('cohorte')
    cohorte_actual = None
    if cohorte_id:
        cohorte_actual = get_object_or_404(Cohorte, id=cohorte_id)

    return Response({
        'preguntas': PreguntaEncuestaSerializer(preguntas, many=True).data,
        'cohorte_actual': CohorteSerializer(cohorte_actual).data if cohorte_actual else None,
    })


@api_view(['GET'])
def api_encuesta_resultados(request):
    materia = request.GET.get('materia')
    datos = _calcular_ef_desde_csv(materia=materia)
    if datos is None:
        return Response({'error': 'No se pudo conectar con Google Sheets.'}, status=503)
    return Response(datos)


# ---------- Ficha técnica ----------

@api_view(['GET'])
def api_ficha_tecnica(request):
    return Response({'detalle': 'Ficha técnica del indicador 11.2 - Prácticas UCSG TEC.'})
