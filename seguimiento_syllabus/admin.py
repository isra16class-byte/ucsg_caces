from django.contrib import admin
from .models import Cohorte, Asignatura, Evidencia, PreguntaEncuesta, RespuestaEncuesta

admin.site.register(Cohorte)
admin.site.register(Asignatura)
admin.site.register(Evidencia)
admin.site.register(PreguntaEncuesta)
admin.site.register(RespuestaEncuesta)