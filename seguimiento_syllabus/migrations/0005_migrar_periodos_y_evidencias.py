from django.db import migrations, models
import django.db.models.deletion


def migrar_datos(apps, schema_editor):
    Cohorte = apps.get_model('seguimiento_syllabus', 'Cohorte')
    PeriodoAcademico = apps.get_model('seguimiento_syllabus', 'PeriodoAcademico')
    Asignatura = apps.get_model('seguimiento_syllabus', 'Asignatura')
    Evidencia = apps.get_model('seguimiento_syllabus', 'Evidencia')

    periodos_por_cohorte = {}
    for cohorte in Cohorte.objects.all():
        periodo, _ = PeriodoAcademico.objects.get_or_create(
            cohorte_id=cohorte.id,
            nombre='PAO 1',
            defaults={'orden': 1},
        )
        periodos_por_cohorte[cohorte.id] = periodo

    for asignatura in Asignatura.objects.all():
        if asignatura.periodo_academico_id:
            continue
        periodo = periodos_por_cohorte.get(asignatura.cohorte_id)
        if periodo is None:
            periodo, _ = PeriodoAcademico.objects.get_or_create(
                cohorte_id=asignatura.cohorte_id,
                nombre='PAO 1',
                defaults={'orden': 1},
            )
            periodos_por_cohorte[asignatura.cohorte_id] = periodo
        asignatura.periodo_academico_id = periodo.id
        asignatura.save(update_fields=['periodo_academico'])

    Evidencia.objects.filter(tipo='malla').update(tipo='malla_curricular')
    Evidencia.objects.filter(tipo='acta').update(tipo='acta_retroalimentacion')


def revertir_datos(apps, schema_editor):
    Evidencia = apps.get_model('seguimiento_syllabus', 'Evidencia')
    Asignatura = apps.get_model('seguimiento_syllabus', 'Asignatura')

    Evidencia.objects.filter(tipo='malla_curricular').update(tipo='malla')
    Evidencia.objects.filter(tipo='acta_retroalimentacion').update(tipo='acta')

    for asignatura in Asignatura.objects.all():
        if asignatura.periodo_academico_id:
            asignatura.cohorte_id = asignatura.periodo_academico.cohorte_id
            asignatura.save(update_fields=['cohorte'])


class Migration(migrations.Migration):

    dependencies = [
        ('seguimiento_syllabus', '0004_periodo_academico'),
    ]

    operations = [
        migrations.RunPython(migrar_datos, revertir_datos),
        migrations.RemoveField(
            model_name='asignatura',
            name='cohorte',
        ),
        migrations.AlterField(
            model_name='asignatura',
            name='periodo_academico',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='asignaturas', to='seguimiento_syllabus.periodoacademico'),
        ),
    ]