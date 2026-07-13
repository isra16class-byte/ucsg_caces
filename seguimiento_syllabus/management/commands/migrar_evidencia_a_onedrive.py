"""
Comando de una sola vez para migrar a OneDrive las evidencias que todavía
tienen el archivo guardado localmente (servidor, carpeta media/), de antes
de la integración con Microsoft Graph API (ver prompt_onedrive.md).

Recorre toda Evidencia con `archivo` no vacío y `onedrive_url` vacío (es
decir, evidencia vieja que no pasó por el flujo nuevo todavía), sube cada
archivo a OneDrive con `subir_a_onedrive()`, y llena `onedrive_url` /
`onedrive_item_id` / `nombre_archivo_original`. NO borra el archivo local
ni el campo `archivo` — eso se hace a mano después, una vez confirmado que
todo migró bien (ver nota en la migración 0011_onedrive_evidencia.py).

⚠️ BLOQUEANTE: como el resto de la integración con OneDrive, este comando
no va a poder subir nada real hasta tener las 4 variables de entorno de
Azure AD configuradas (AZURE_TENANT_ID, AZURE_CLIENT_ID,
AZURE_CLIENT_SECRET, ONEDRIVE_DRIVE_ID) — sin ellas, cada intento de subida
falla con OneDriveNoConfiguradoError y se reporta como fallo, no rompe el
comando.

USO:
  1) Primero, modo DRY-RUN (no sube nada, solo muestra qué se va a tocar):
       python manage.py migrar_evidencia_a_onedrive

  2) Si la lista se ve bien, aplicar la subida real:
       python manage.py migrar_evidencia_a_onedrive --aplicar
"""

from django.core.management.base import BaseCommand
from seguimiento_syllabus.models import Evidencia
from seguimiento_syllabus.onedrive_service import (
    subir_a_onedrive,
    construir_ruta_carpetas,
    construir_nombre_archivo,
    ruta_destino_completa,
    OneDriveError,
)


class Command(BaseCommand):
    help = (
        "Migra a OneDrive las evidencias que todavía tienen el archivo guardado "
        "localmente. Dry-run por default, --aplicar para confirmar."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--aplicar",
            action="store_true",
            help="Sube los archivos de verdad a OneDrive. Sin esta bandera, solo dry-run.",
        )

    def handle(self, *args, **options):
        aplicar = options["aplicar"]

        pendientes = (
            Evidencia.objects.exclude(archivo="")
            .filter(archivo__isnull=False, onedrive_url="")
            .order_by("id")
        )
        total = pendientes.count()

        if total == 0:
            self.stdout.write(self.style.SUCCESS(
                "No hay evidencia local pendiente de migrar a OneDrive."
            ))
            return

        self.stdout.write(f"Se encontraron {total} evidencia(s) con archivo local sin migrar:\n")
        for ev in pendientes:
            # Ruta prevista en OneDrive (Carrera/Cohorte/PAO/Asignatura, o
            # Carrera/Evidencia General de Carrera para EF5) — se muestra
            # también en el dry-run, sin subir nada, para poder revisar
            # cómo va a quedar organizado antes de correr --aplicar.
            carpetas = construir_ruta_carpetas(
                carrera=ev.carrera,
                periodo_academico=ev.periodo_academico,
                asignatura=ev.asignatura,
            )
            nombre_archivo = construir_nombre_archivo(ev.tipo, ev.archivo.name.split("/")[-1])
            ruta_prevista = ruta_destino_completa(carpetas, nombre_archivo)
            self.stdout.write(
                f"  - id={ev.id} | tipo={ev.tipo} | archivo={ev.archivo.name} "
                f"| subida={ev.fecha_subida:%Y-%m-%d %H:%M}\n"
                f"      -> OneDrive: {ruta_prevista}"
            )

        if not aplicar:
            self.stdout.write(
                self.style.WARNING(
                    "\nEsto fue un DRY-RUN: no se subió nada. "
                    "Si la lista de arriba se ve correcta, volvé a correr con --aplicar."
                )
            )
            return

        migradas_ok = 0
        fallidas = []

        for ev in pendientes:
            carpetas = construir_ruta_carpetas(
                carrera=ev.carrera,
                periodo_academico=ev.periodo_academico,
                asignatura=ev.asignatura,
            )
            nombre_archivo = construir_nombre_archivo(ev.tipo, ev.archivo.name.split("/")[-1])
            try:
                ev.archivo.open("rb")
                try:
                    resultado = subir_a_onedrive(ev.archivo, carpetas, nombre_archivo)
                finally:
                    ev.archivo.close()
            except OneDriveError as exc:
                fallidas.append((ev.id, str(exc)))
                continue
            except Exception as exc:  # noqa: BLE001 - reportar cualquier falla, no cortar el resto
                fallidas.append((ev.id, f"Error inesperado: {exc}"))
                continue

            ev.onedrive_url = resultado["webUrl"]
            ev.onedrive_item_id = resultado["item_id"]
            ev.nombre_archivo_original = ev.archivo.name.split("/")[-1]
            ev.save(update_fields=["onedrive_url", "onedrive_item_id", "nombre_archivo_original"])
            migradas_ok += 1

        self.stdout.write(self.style.SUCCESS(f"\nMigradas OK: {migradas_ok}/{total}"))
        if fallidas:
            self.stdout.write(self.style.ERROR(f"Fallidas: {len(fallidas)}"))
            for ev_id, motivo in fallidas:
                self.stdout.write(self.style.ERROR(f"  - id={ev_id}: {motivo}"))
            self.stdout.write(
                self.style.WARNING(
                    "\nLas evidencias fallidas conservan su archivo local intacto — "
                    "se puede volver a correr este comando con --aplicar más adelante, "
                    "solo va a reintentar las que sigan con onedrive_url vacío."
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS(
                "Todas las evidencias pendientes se migraron sin errores."
            ))