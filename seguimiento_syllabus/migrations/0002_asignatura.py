import django.db.models.deletion
from django.db import migrations, models


def crear_asignatura_general_y_migrar(apps, schema_editor):
    """
    Para cada Evidencia existente, crea (si no existe) una Asignatura
    'General' dentro de su cohorte actual, y reasigna la evidencia a esa
    asignatura. Así no se pierde ningún archivo ya subido.
    """
    Cohorte = apps.get_model('seguimiento_syllabus', 'Cohorte')
    Asignatura = apps.get_model('seguimiento_syllabus', 'Asignatura')
    Evidencia = apps.get_model('seguimiento_syllabus', 'Evidencia')

    cache = {}
    for ev in Evidencia.objects.all():
        cohorte_id = ev.cohorte_id
        if cohorte_id not in cache:
            asignatura, _ = Asignatura.objects.get_or_create(
                cohorte_id=cohorte_id, nombre='General'
            )
            cache[cohorte_id] = asignatura
        ev.asignatura = cache[cohorte_id]
        ev.save()


def revertir(apps, schema_editor):
    # No se intenta reconstruir el estado anterior; es una migración de datos
    # de un solo sentido (hacia adelante).
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('seguimiento_syllabus', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Asignatura',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=150)),
                ('docente', models.CharField(blank=True, default='', max_length=150)),
                ('cohorte', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='asignaturas', to='seguimiento_syllabus.cohorte')),
            ],
        ),
        migrations.AddField(
            model_name='evidencia',
            name='asignatura',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='evidencias', to='seguimiento_syllabus.asignatura'),
        ),
        migrations.RunPython(crear_asignatura_general_y_migrar, revertir),
        migrations.RemoveField(
            model_name='evidencia',
            name='cohorte',
        ),
        migrations.AlterField(
            model_name='evidencia',
            name='asignatura',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='evidencias', to='seguimiento_syllabus.asignatura'),
        ),
    ]
