"""
Comando de una sola vez para limpiar la evidencia institucional de PAO
(periodo_academico != None) que quedó del modelo anterior a la
reorganización de niveles del 10 de julio (Tabla 14, CACES, indicador
11.2).

Bajo el modelo nuevo, EF2 (acta_ajuste_curricular) y EF3 (evidencia_difusion)
volvieron a ser evidencia de nivel ASIGNATURA, y EF5 (reglamento_normativa) +
malla_curricular pasaron a ser evidencia de nivel CARRERA. Ya no existe
ningún tipo de evidencia de nivel PeriodoAcademico (TIPOS_POR_PERIODO quedó
vacío en el modelo), así que toda Evidencia con periodo_academico != None es
huérfana bajo el cálculo nuevo: _calcular_resultado_generico() ya no la lee
desde ahí, y no la mueve automáticamente a asignatura ni a carrera porque
esa reasignación requeriría criterio humano (a qué asignatura puntual, en
el caso de EF2/EF3, corresponde re-asociarla) que este script no puede
inferir de forma segura.

USO:
  1) Primero, modo DRY-RUN (no borra nada, solo muestra qué se va a tocar):
       python manage.py migrar_evidencia_a_nuevos_niveles

  2) Si la lista se ve bien, aplicar el borrado real:
       python manage.py migrar_evidencia_a_nuevos_niveles --aplicar

DESPUÉS DE CORRER CON --aplicar, HAY QUE RESUBIR A MANO:
  - EF2 (Acta de Ajuste Curricular) y EF3 (Evidencia de Difusión): por cada
    asignatura que las necesite (ya no se propagan solas dentro de un PAO).
  - EF5 (Reglamento/Normativa) y Malla Curricular: UNA sola vez cada una,
    a nivel Carrera (ya no hace falta resubir por asignatura ni por PAO —
    con una sola subida se refleja en todas las asignaturas de todos los
    PAO/cohortes de esa carrera).
"""

from django.core.management.base import BaseCommand
from seguimiento_syllabus.models import Evidencia


class Command(BaseCommand):
    help = (
        "Borra evidencia huérfana de nivel PeriodoAcademico (modelo anterior a la "
        "reorganización de niveles del 10 de julio). Dry-run por default, --aplicar para confirmar."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--aplicar",
            action="store_true",
            help="Aplica el borrado real en la base de datos. Sin esta bandera, solo muestra un dry-run.",
        )

    def handle(self, *args, **options):
        aplicar = options["aplicar"]

        afectadas = (
            Evidencia.objects.filter(periodo_academico__isnull=False)
            .select_related("periodo_academico", "periodo_academico__cohorte")
            .order_by("periodo_academico__cohorte_id", "periodo_academico_id", "tipo")
        )
        total = afectadas.count()

        if total == 0:
            self.stdout.write(self.style.SUCCESS(
                "No hay evidencia con periodo_academico != None. No hay nada que limpiar."
            ))
            return

        self.stdout.write(f"Se encontraron {total} evidencia(s) de nivel PeriodoAcademico (modelo anterior):\n")
        for ev in afectadas:
            pao = ev.periodo_academico
            self.stdout.write(
                f"  - id={ev.id} | tipo={ev.tipo} | cohorte=\"{pao.cohorte.nombre}\" "
                f"| PAO=\"{pao.nombre}\" (id={pao.id}) | archivo={ev.archivo.name} "
                f"| subida={ev.fecha_subida:%Y-%m-%d %H:%M}"
            )

        if not aplicar:
            self.stdout.write(
                self.style.WARNING(
                    "\nEsto fue un DRY-RUN: no se borró nada. "
                    "Si la lista de arriba se ve correcta, volvé a correr con --aplicar para borrarlas."
                )
            )
            return

        borradas, _ = afectadas.delete()
        self.stdout.write(self.style.SUCCESS(f"\nListo. {borradas} fila(s) borrada(s)."))
        self.stdout.write(
            self.style.WARNING(
                "\nIMPORTANTE — hay que resubir manualmente:\n"
                "  - EF2 (Acta de Ajuste Curricular) y EF3 (Evidencia de Difusión): por cada "
                "asignatura que las necesite (ya NO se propagan solas dentro de un PAO).\n"
                "  - EF5 (Reglamento/Normativa) y Malla Curricular: UNA sola vez cada una, "
                "a nivel Carrera (ya no hace falta resubir por asignatura ni por PAO)."
            )
        )