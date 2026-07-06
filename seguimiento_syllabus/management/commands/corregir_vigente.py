"""
Comando de una sola vez para corregir datos heredados del bug de DRF donde
toda Evidencia subida por el endpoint POST /api/evidencias/ (antes del fix
en api_views.py) quedaba guardada con vigente=False, sin importar el
default=True del modelo.

No hay en el código (ni en el admin, ni en el frontend) ningún camino donde
alguien haya podido marcar intencionalmente vigente=False para una
evidencia real. Por eso este script asume que TODO registro con
vigente=False actual es una víctima del bug, no una decisión real, y los
corrige a vigente=True.

USO:
  1) Primero, modo DRY-RUN (no cambia nada, solo muestra qué se va a tocar):
       python manage.py corregir_vigente

  2) Si la lista se ve bien, aplicar el cambio real:
       python manage.py corregir_vigente --aplicar
"""

from django.core.management.base import BaseCommand
from seguimiento_syllabus.models import Evidencia


class Command(BaseCommand):
    help = "Corrige evidencias con vigente=False heredadas del bug de DRF (multipart/BooleanField)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--aplicar",
            action="store_true",
            help="Aplica el cambio real en la base de datos. Sin esta bandera, solo muestra un dry-run.",
        )

    def handle(self, *args, **options):
        aplicar = options["aplicar"]

        afectadas = Evidencia.objects.filter(vigente=False).select_related("asignatura").order_by("asignatura_id", "tipo")
        total = afectadas.count()

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay evidencias con vigente=False. No hay nada que corregir."))
            return

        self.stdout.write(f"Se encontraron {total} evidencia(s) con vigente=False:\n")
        for ev in afectadas:
            self.stdout.write(
                f"  - id={ev.id} | asignatura=\"{ev.asignatura.nombre}\" (id={ev.asignatura_id}) "
                f"| tipo={ev.tipo} | archivo={ev.archivo.name} | subida={ev.fecha_subida:%Y-%m-%d %H:%M}"
            )

        if not aplicar:
            self.stdout.write(
                self.style.WARNING(
                    "\nEsto fue un DRY-RUN: no se modificó nada. "
                    "Si la lista de arriba se ve correcta, volvé a correr con --aplicar para corregirlas."
                )
            )
            return

        actualizadas = afectadas.update(vigente=True)
        self.stdout.write(self.style.SUCCESS(f"\nListo. {actualizadas} evidencia(s) corregida(s) a vigente=True."))