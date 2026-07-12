# Generated manually on 2026-07-10.
#
# Paso 2 de 2: ahora que la migración 0009 ya pobló Cohorte.carrera en
# TODAS las filas existentes (con "Desarrollo de Software"), se vuelve el
# campo obligatorio (blank/null=False). Evidencia.carrera se queda
# nullable siempre — solo lo usan los tipos de nivel Carrera.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('seguimiento_syllabus', '0009_carrera_y_evidencia_carrera'),
    ]

    operations = [
        migrations.AlterField(
            model_name='cohorte',
            name='carrera',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cohortes',
                to='seguimiento_syllabus.carrera',
            ),
        ),
    ]