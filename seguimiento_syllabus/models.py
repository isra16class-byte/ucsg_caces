from django.core.validators import FileExtensionValidator
from django.db import models

class Cohorte(models.Model):
    nombre = models.CharField(max_length=100)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre


class PeriodoAcademico(models.Model):
    cohorte = models.ForeignKey(Cohorte, on_delete=models.CASCADE, related_name='periodos')
    nombre = models.CharField(max_length=50)
    orden = models.IntegerField(default=1)
    fecha_inicio = models.DateField(null=True, blank=True)
    fecha_fin = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['orden']

    def __str__(self):
        return f"{self.cohorte.nombre} - {self.nombre}"


class Asignatura(models.Model):
    periodo_academico = models.ForeignKey(
        PeriodoAcademico,
        on_delete=models.CASCADE,
        related_name='asignaturas',
    )
    nombre = models.CharField(max_length=150)
    docente = models.CharField(max_length=150, blank=True, default='')

    def __str__(self):
        return f"{self.nombre} ({self.periodo_academico})"


class Evidencia(models.Model):
    TIPO_CHOICES = [
        ('malla_curricular', 'Malla Curricular'),
        ('syllabus', 'Syllabus'),
        ('acta_retroalimentacion', 'Acta de Retroalimentación'),
        ('acta_ajuste_curricular', 'Acta de Ajuste Curricular (EF2)'),
        ('evidencia_difusion', 'Evidencia de Difusión (EF3)'),
        ('reglamento_normativa', 'Reglamento / Normativa Institucional (EF5)'),
    ]
    asignatura = models.ForeignKey(Asignatura, on_delete=models.CASCADE, related_name='evidencias')
    tipo = models.CharField(max_length=30, choices=TIPO_CHOICES)
    archivo = models.FileField(
        upload_to='evidencias/',
        validators=[FileExtensionValidator(['pdf', 'jpg', 'jpeg', 'png', 'mp4'])],
    )
    subido_por = models.CharField(max_length=150, blank=True, default='')
    fecha_subida = models.DateTimeField(auto_now_add=True)
    vigente = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.tipo} - {self.asignatura}"