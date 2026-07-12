"""
Comando de diagnóstico para el bug de vigente=False.

Uso (desde la carpeta del proyecto, con el venv activado):

    # Solo revisar, sin tocar nada:
    python manage.py revisar_vigencia_evidencias

    # Revisar y corregir automáticamente (marca vigente=True la evidencia
    # MÁS RECIENTE de cada tipo/asignatura que esté en False, dejando las
    # demás intactas si las hubiera):
    python manage.py revisar_vigencia_evidencias --fix

Este comando NO borra nada ni toca archivos, solo actualiza el campo
booleano `vigente` en la base de datos.
"""
from django.core.management.base import BaseCommand
from seguimiento_syllabus.models import Evidencia


class Command(BaseCommand):
    help = "Diagnostica (y opcionalmente corrige) evidencias guardadas con vigente=False por el bug de DRF."

    def add_arguments(self, parser):
        parser.add_argument(
            "--fix",
            action="store_true",
            help="Corrige automáticamente marcando vigente=True la evidencia más reciente de cada tipo/asignatura afectada.",
        )

    def handle(self, *args, **options):
        no_vigentes = Evidencia.objects.filter(vigente=False).order_by(
            "asignatura_id", "tipo", "-fecha_subida"
        )
        total = no_vigentes.count()

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay ninguna evidencia con vigente=False. Todo en orden."))
            return

        self.stdout.write(self.style.WARNING(f"Se encontraron {total} evidencia(s) con vigente=False:\n"))

        # Agrupamos por (asignatura, tipo) para saber cuál sería "la vigente"
        # si decidimos corregir (la más reciente de cada combinación).
        vistos = set()
        a_corregir = []

        for ev in no_vigentes:
            clave = (ev.asignatura_id, ev.tipo)
            es_la_mas_reciente_del_grupo = clave not in vistos
            vistos.add(clave)

            marca = " <- se marcaría vigente=True" if es_la_mas_reciente_del_grupo else " (hay una más reciente del mismo tipo, esta quedaría igual)"
            self.stdout.write(
                f"  id={ev.id:<4} asignatura_id={ev.asignatura_id:<4} tipo={ev.tipo:<25} "
                f"archivo={ev.archivo.name:<40} subida={ev.fecha_subida}{marca}"
            )
            if es_la_mas_reciente_del_grupo:
                a_corregir.append(ev.id)

        self.stdout.write("")

        if not options["fix"]:
            self.stdout.write(
                self.style.NOTICE(
                    f"Modo solo-lectura. Para corregir {len(a_corregir)} registro(s) "
                    f"(la evidencia más reciente de cada tipo/asignatura), corré:\n"
                    f"    python manage.py revisar_vigencia_evidencias --fix"
                )
            )
            return

        actualizados = Evidencia.objects.filter(id__in=a_corregir).update(vigente=True)
        self.stdout.write(self.style.SUCCESS(f"Listo: se marcaron vigente=True {actualizados} registro(s)."))
        restantes = Evidencia.objects.filter(vigente=False).count()
        if restantes:
            self.stdout.write(
                self.style.WARNING(
                    f"Quedan {restantes} registro(s) en False: son evidencias más viejas del mismo "
                    f"tipo/asignatura, reemplazadas por una más reciente. Si tenías previsto un "
                    f"historial de versiones de evidencia, revisalas a mano; si no, se pueden dejar así "
                    f"(no afectan el cálculo) o borrarlas."
                )
            )
