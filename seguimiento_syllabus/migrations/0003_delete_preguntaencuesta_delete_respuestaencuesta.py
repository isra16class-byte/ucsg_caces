from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('seguimiento_syllabus', '0002_asignatura'),
    ]

    operations = [
        migrations.DeleteModel(
            name='RespuestaEncuesta',
        ),
        migrations.DeleteModel(
            name='PreguntaEncuesta',
        ),
    ]