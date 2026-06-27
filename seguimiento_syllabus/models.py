from django.db import models

class Cohorte(models.Model):
    nombre = models.CharField(max_length=100)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre

class Evidencia(models.Model):
    TIPO_CHOICES = [
        ('malla', 'Malla Curricular'),
        ('syllabus', 'Syllabus'),
        ('acta', 'Acta de Retroalimentación'),
    ]
    cohorte = models.ForeignKey(Cohorte, on_delete=models.CASCADE)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    archivo = models.FileField(upload_to='evidencias/')
    fecha_subida = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.tipo} - {self.cohorte}"

class PreguntaEncuesta(models.Model):
    texto = models.TextField()
    orden = models.IntegerField()

    def __str__(self):
        return f"Pregunta {self.orden}: {self.texto[:50]}"

class RespuestaEncuesta(models.Model):
    pregunta = models.ForeignKey(PreguntaEncuesta, on_delete=models.CASCADE)
    cohorte = models.ForeignKey(Cohorte, on_delete=models.CASCADE)
    respuesta_si = models.IntegerField(default=0)
    respuesta_no = models.IntegerField(default=0)

    def __str__(self):
        return f"Respuesta - {self.pregunta} - {self.cohorte}"