from django.db import migrations


def normalizar_evidencias(apps, schema_editor):
    Evidencia = apps.get_model('seguimiento_syllabus', 'Evidencia')
    Evidencia.objects.filter(tipo='normativa').update(tipo='reglamento_normativa')


def revertir_normalizacion(apps, schema_editor):
    Evidencia = apps.get_model('seguimiento_syllabus', 'Evidencia')
    Evidencia.objects.filter(tipo='reglamento_normativa').update(tipo='normativa')


class Migration(migrations.Migration):

    dependencies = [
        ('seguimiento_syllabus', '0006_alter_evidencia_archivo'),
    ]

    operations = [
        migrations.RunPython(normalizar_evidencias, revertir_normalizacion),
    ]