"""
Carga en bloque las asignaturas de la malla curricular de "Desarrollo de
Software" en los 3 PAO de una cohorte. Crea los PeriodoAcademico que falten
y crea cada Asignatura con get_or_create (nombre + periodo), así que es
seguro correrlo más de una vez: no duplica lo que ya existe.

*** REVISAR ANTES DE CORRER ***
Las filas marcadas con "# OJO" abajo son las que el PDF de la malla dejaba
ambiguas por celdas combinadas (Práctica Laboral, Servicio Comunitario, y la
fila Sistemas Operativos / Android / Pruebas de Software). Mi conteo con esta
lectura da 22 asignaturas en total, que coincide con "NÚMERO TOTAL DE
ASIGNATURAS: 22" de la malla, pero corregí a ojo cuál va en qué PAO en esas
filas dudosas — confirmá contra el PDF antes de aplicar.

USO:
  1) Dry-run (no crea nada, solo muestra qué va a crear):
       python manage.py cargar_malla --cohorte "Cohorte B 2026"

  2) Aplicar de verdad:
       python manage.py cargar_malla --cohorte "Cohorte B 2026" --aplicar
"""

from django.core.management.base import BaseCommand, CommandError
from seguimiento_syllabus.models import Cohorte, PeriodoAcademico, Asignatura

MALLA_DESARROLLO_SOFTWARE = {
    1: [
        "Comunicación efectiva y trabajo en equipo",
        "Cultura tecnológica y digital",
        "Humanismo y Persona",
        "Fundamentos de Programación y Algoritmos",
        "Desarrollo de Interfaces de Usuario y Experiencia de Usuario (UI/UX) ",
        "Bases para el desarrollo de Aplicaciones Móviles para Android",
        "Bases para el desarrollo de Aplicaciones Móviles para iOS",
        "Bases para el desarrollo Cross-Platform",
    ],
    2: [
        "Seguridad y Optimización en Aplicaciones Móviles",
        "Introducción a Lenguajes de Programación",
        "Implementación de Estructuras de Datos y Algoritmos Avanzados",
        "Fundamentos de bases de datos",
        "Humanismo y Sociedad",
        "Emprendimiento e innovación",
    ],
    3: [
        "Pensamiento crítico y lógico",
        "Aplicación de conceptos de Ingeniería de software",
        "Metodologías de Desarrollo Web",
        "Principios de Redes y Comunicaciones",
        "Principios de los Sistemas Operativos e implementación de Software Empresarial",
        "Pruebas de Software y Aseguramiento de la Calidad",
        "Integración Curricular en Programación aplicada",
        "Investigación aplicada y titulación",
    ],
}

NOMBRES_PAO = {1: "PAO 1", 2: "PAO 2", 3: "PAO 3"}


class Command(BaseCommand):
    help = "Carga en bloque las asignaturas de la malla de Desarrollo de Software para una cohorte."

    def add_arguments(self, parser):
        parser.add_argument("--cohorte", required=True, help='Nombre exacto de la cohorte, ej: "Cohorte B 2026"')
        parser.add_argument("--aplicar", action="store_true", help="Aplica los cambios reales. Sin esto, solo dry-run.")

    def handle(self, *args, **options):
        nombre_cohorte = options["cohorte"]
        aplicar = options["aplicar"]

        try:
            cohorte = Cohorte.objects.get(nombre=nombre_cohorte)
        except Cohorte.DoesNotExist:
            raise CommandError(f'No existe una Cohorte con nombre exacto "{nombre_cohorte}".')

        total_nuevas_asignaturas = 0
        total_nuevos_periodos = 0

        for orden, asignaturas in MALLA_DESARROLLO_SOFTWARE.items():
            periodo = PeriodoAcademico.objects.filter(cohorte=cohorte, orden=orden).first()
            if periodo is None:
                total_nuevos_periodos += 1
                if aplicar:
                    periodo = PeriodoAcademico.objects.create(cohorte=cohorte, nombre=NOMBRES_PAO[orden], orden=orden)
                    self.stdout.write(self.style.SUCCESS(f"Creado periodo: {periodo.nombre}"))
                else:
                    self.stdout.write(f"[DRY-RUN] Se crearía el periodo {NOMBRES_PAO[orden]}")

            self.stdout.write(f"\n--- {NOMBRES_PAO[orden]} ---")
            for nombre_asig in asignaturas:
                ya_existe = periodo is not None and Asignatura.objects.filter(periodo_academico=periodo, nombre=nombre_asig).exists()
                if ya_existe:
                    self.stdout.write(f"  = ya existe: {nombre_asig}")
                    continue

                total_nuevas_asignaturas += 1
                if aplicar:
                    Asignatura.objects.create(periodo_academico=periodo, nombre=nombre_asig)
                    self.stdout.write(self.style.SUCCESS(f"  + creada: {nombre_asig}"))
                else:
                    self.stdout.write(f"  [DRY-RUN] se crearía: {nombre_asig}")

        self.stdout.write(
            f"\nTotal: {total_nuevos_periodos} periodo(s) y {total_nuevas_asignaturas} asignatura(s) "
            f"{'creadas' if aplicar else 'a crear (dry-run, nada se guardó todavía)'}."
        )