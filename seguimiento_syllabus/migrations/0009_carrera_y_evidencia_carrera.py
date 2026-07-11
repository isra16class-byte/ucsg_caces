# Generated manually on 2026-07-10.
#
# Paso 1 de 2 de la reorganización de niveles de evidencia (ver Tabla 14 de
# CACES, indicador 11.2): crea el modelo Carrera y agrega los FK nullable
# Cohorte.carrera y Evidencia.carrera, y en la misma migración (RunPython)
# crea la fila Carrera("Desarrollo de Software") y la asigna a TODAS las
# Cohorte existentes. Se deja nullable en este paso a propósito, para no
# romper filas ya existentes antes de poblarlas — la migración 0010 recién
# después vuelve Cohorte.carrera obligatorio (ya con todas las filas
# pobladas).
#
# Evidencia.carrera se queda nullable para siempre: solo lo usan los tipos
# de nivel Carrera (malla_curricular, reglamento_normativa); el resto de
# evidencia sigue atada a Asignatura.

import django.db.models.deletion
from django.db import migrations, models


def crear_carrera_y_asignarla(apps, schema_editor):
    Carrera = apps.get_model('seguimiento_syllabus', 'Carrera')
    Cohorte = apps.get_model('seguimiento_syllabus', 'Cohorte')

    carrera, _ = Carrera.objects.get_or_create(nombre='Desarrollo de Software')
    Cohorte.objects.update(carrera=carrera)


def revertir_asignacion(apps, schema_editor):
    # No hace falta deshacer nada de datos: al bajar la migración, el campo
    # Cohorte.carrera vuelve a eliminarse en la operación de schema
    # correspondiente (RemoveField), así que no hay estado que limpiar acá.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('seguimiento_syllabus', '0008_evidencia_periodo_academico'),
    ]

    operations = [
        migrations.CreateModel(
            name='Carrera',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=150, unique=True)),
            ],
        ),
        migrations.AddField(
            model_name='cohorte',
            name='carrera',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cohortes',
                to='seguimiento_syllabus.carrera',
            ),
        ),
        migrations.AddField(
            model_name='evidencia',
            name='carrera',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='evidencias',
                to='seguimiento_syllabus.carrera',
            ),
        ),
        migrations.RunPython(crear_carrera_y_asignarla, revertir_asignacion),
    ]