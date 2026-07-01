from django.urls import path
from . import views
from . import api_views

urlpatterns = [
    # Vistas HTML existentes (sin cambios)
    path('', views.resultado, name='resultado'),
    path('cohortes/', views.cohortes, name='cohortes'),
    path('evidencias/', views.evidencias, name='evidencias'),
    path('encuesta/', views.encuesta, name='encuesta'),
    path('encuesta/resultados/', views.calcular_resultados_encuesta, name='encuesta_resultados'),
    path('ficha-tecnica/', views.ficha_tecnica, name='ficha_tecnica'),

    # API JSON nueva, para el frontend React
    path('api/cohortes/', api_views.api_cohortes, name='api_cohortes'),
    path('api/asignaturas/', api_views.api_asignaturas, name='api_asignaturas'),
    path('api/materias-encuesta/', api_views.api_materias_encuesta, name='api_materias_encuesta'),
    path('api/evidencias/', api_views.api_evidencias, name='api_evidencias'),
    path('api/resultado/', api_views.api_resultado, name='api_resultado'),
    path('api/resultado-cohorte/', api_views.api_resultado_cohorte, name='api_resultado_cohorte'),
    path('api/encuesta/', api_views.api_encuesta, name='api_encuesta'),
    path('api/encuesta/resultados/', api_views.api_encuesta_resultados, name='api_encuesta_resultados'),
    path('api/ficha-tecnica/', api_views.api_ficha_tecnica, name='api_ficha_tecnica'),
]