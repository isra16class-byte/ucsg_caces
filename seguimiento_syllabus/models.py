from django.core.validators import FileExtensionValidator
from django.db import models


class Carrera(models.Model):
    """
    Nivel más alto de la jerarquía institucional. El sistema se diseñó desde
    el inicio solo para "Desarrollo de Software", pero está pensado para
    soportar las ~23 carreras del TEC a futuro sin otra migración grande —
    por eso este modelo existe desde ya, aunque hoy solo tenga 1 fila.
    """
    nombre = models.CharField(max_length=150, unique=True)

    def __str__(self):
        return self.nombre


class Cohorte(models.Model):
    carrera = models.ForeignKey(
        Carrera, on_delete=models.PROTECT, related_name='cohortes',
    )
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

    # Niveles reorganizados el 10 de julio para coincidir con la Tabla 14
    # (indicador 11.2) del documento oficial de CACES "MODELO DE EVALUACIÓN
    # PARA UAFTT, enero 2026":
    #
    #   - malla_curricular y reglamento_normativa (EF5) son evidencia de
    #     nivel CARRERA: el mismo documento aplica a TODA la carrera (todas
    #     las cohortes/PAO/asignaturas de esa carrera), no solo a un PAO.
    #     Se suben UNA sola vez por carrera.
    #   - syllabus, acta_retroalimentacion, acta_ajuste_curricular (EF2) y
    #     evidencia_difusion (EF3) son evidencia de nivel ASIGNATURA: varían
    #     por materia, se suben una vez por asignatura.
    #   - TIPOS_POR_PERIODO queda vacío a propósito (no se borra el
    #     concepto): ningún tipo actual es institucional-de-PAO por ahora,
    #     pero se deja implementado por si a futuro EF4 suma evidencia
    #     documental propia con ese nivel.
    TIPOS_POR_CARRERA = {'malla_curricular', 'reglamento_normativa'}
    TIPOS_POR_PERIODO = set()

    asignatura = models.ForeignKey(
        Asignatura, on_delete=models.CASCADE, related_name='evidencias',
        null=True, blank=True,
    )
    periodo_academico = models.ForeignKey(
        PeriodoAcademico, on_delete=models.CASCADE, related_name='evidencias',
        null=True, blank=True,
    )
    carrera = models.ForeignKey(
        Carrera, on_delete=models.CASCADE, related_name='evidencias',
        null=True, blank=True,
    )
    tipo = models.CharField(max_length=30, choices=TIPO_CHOICES)
    archivo = models.FileField(
        upload_to='evidencias/',
        validators=[FileExtensionValidator(['pdf', 'jpg', 'jpeg', 'png', 'mp4'])],
    )
    subido_por = models.CharField(max_length=150, blank=True, default='')
    fecha_subida = models.DateTimeField(auto_now_add=True)
    vigente = models.BooleanField(default=True)

    def __str__(self):
        contexto = self.carrera or self.periodo_academico or self.asignatura
        return f"{self.tipo} - {contexto}"