from django.urls import path
from . import api_views

urlpatterns = [
    # API JSON nueva, para el frontend React
    path('api/carreras/', api_views.api_carreras, name='api_carreras'),
    path('api/cohortes/', api_views.api_cohortes, name='api_cohortes'),
    path('api/periodos/', api_views.api_periodos, name='api_periodos'),
    path('api/asignaturas/', api_views.api_asignaturas, name='api_asignaturas'),
    path('api/materias-encuesta/', api_views.api_materias_encuesta, name='api_materias_encuesta'),
    path('api/evidencias/', api_views.api_evidencias, name='api_evidencias'),
    path('api/evidencias/<int:evidencia_id>/archivo/', api_views.evidencia_archivo, name='evidencia_archivo'),
    path('api/resultado/', api_views.api_resultado, name='api_resultado'),
    path('api/resultado-cohorte/', api_views.api_resultado_cohorte, name='api_resultado_cohorte'),
    path('api/encuesta/', api_views.api_encuesta, name='api_encuesta'),
    path('api/encuesta/resultados/', api_views.api_encuesta_resultados, name='api_encuesta_resultados'),
    path('api/encuesta-detalle/', api_views.api_encuesta_detalle, name='api_encuesta_detalle'),
    path('api/ficha-tecnica/', api_views.api_ficha_tecnica, name='api_ficha_tecnica'),
]