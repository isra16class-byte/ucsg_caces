from django.db import migrations, models
import django.db.models.deletion
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('seguimiento_syllabus', '0003_delete_preguntaencuesta_delete_respuestaencuesta'),
    ]

    operations = [
        migrations.CreateModel(
            name='PeriodoAcademico',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=50)),
                ('orden', models.IntegerField(default=1)),
                ('fecha_inicio', models.DateField(blank=True, null=True)),
                ('fecha_fin', models.DateField(blank=True, null=True)),
                ('cohorte', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='periodos', to='seguimiento_syllabus.cohorte')),
            ],
            options={
                'ordering': ['orden'],
            },
        ),
        migrations.AddField(
            model_name='asignatura',
            name='periodo_academico',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='asignaturas', to='seguimiento_syllabus.periodoacademico'),
        ),
        migrations.AlterField(
            model_name='evidencia',
            name='tipo',
            field=models.CharField(choices=[('malla_curricular', 'Malla Curricular'), ('syllabus', 'Syllabus'), ('acta_retroalimentacion', 'Acta de Retroalimentación'), ('acta_ajuste_curricular', 'Acta de Ajuste Curricular (EF2)'), ('evidencia_difusion', 'Evidencia de Difusión (EF3)'), ('reglamento_normativa', 'Reglamento / Normativa Institucional (EF5)')], max_length=30),
        ),
        migrations.AddField(
            model_name='evidencia',
            name='subido_por',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.AddField(
            model_name='evidencia',
            name='vigente',
            field=models.BooleanField(default=True),
        ),
    ]