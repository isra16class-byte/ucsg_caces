from django.urls import path
from . import views

urlpatterns = [
    path('', views.resultado, name='resultado'),
    path('cohortes/', views.cohortes, name='cohortes'),
    path('evidencias/', views.evidencias, name='evidencias'),
    path('encuesta/', views.encuesta, name='encuesta'),
    path('encuesta/resultados/', views.calcular_resultados_encuesta, name='encuesta_resultados'),
    path('ficha-tecnica/', views.ficha_tecnica, name='ficha_tecnica'),
]