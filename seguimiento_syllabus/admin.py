from django.contrib import admin
from .models import Cohorte, PeriodoAcademico, Asignatura, Evidencia

admin.site.register(Cohorte)
admin.site.register(PeriodoAcademico)
admin.site.register(Asignatura)
admin.site.register(Evidencia)