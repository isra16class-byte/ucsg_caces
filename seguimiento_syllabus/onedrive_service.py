"""
Servicio de subida de archivos de evidencia a OneDrive vía Microsoft Graph
API, con autenticación app-only (client credentials) usando MSAL.

⚠️ BLOQUEANTE (ver prompt_onedrive.md): este flujo requiere una app
registrada en Azure AD con permiso `Files.ReadWrite.All` (tipo Application,
no delegated) sobre una cuenta OneDrive. NO sirve una cuenta personal tipo
outlook.com/hotmail.com para autenticación app-only — tiene que ser una
cuenta Microsoft 365 (institucional o, mientras tanto, un tenant de prueba
del Microsoft 365 Developer Program). Las 4 variables de entorno
(AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, ONEDRIVE_DRIVE_ID)
tienen que estar configuradas en `.env` para que esto funcione — ver
`.env.example`. Sin ellas, `subir_a_onedrive()` falla explícitamente con
`OneDriveNoConfiguradoError`, NO con un traceback genérico de conexión.
"""
import mimetypes

import msal
import requests
from django.conf import settings

GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
GRAPH_SCOPE = ["https://graph.microsoft.com/.default"]

# Simple upload (PUT .../content) solo sirve de forma confiable para
# archivos chicos. Microsoft Graph recomienda upload session a partir de
# 4MB — los .mp4 que el FileExtensionValidator del modelo ya permite hoy
# van a superar esto seguido, por eso existe la rama de upload session.
LIMITE_SIMPLE_UPLOAD_BYTES = 4 * 1024 * 1024  # 4MB

# Carpeta destino dentro del drive de OneDrive. Todas las evidencias se
# suben acá, bajo un nombre único derivado del id/tipo/asignatura para
# evitar colisiones entre asignaturas o tipos distintos.
CARPETA_EVIDENCIAS = "evidencias_caces_11_2"


class OneDriveError(Exception):
    """Excepción base para cualquier falla del flujo de OneDrive."""


class OneDriveNoConfiguradoError(OneDriveError):
    """Faltan credenciales de Azure AD en el entorno (.env)."""


class OneDriveAuthError(OneDriveError):
    """Graph API rechazó la autenticación (credenciales inválidas/expiradas)."""


class OneDriveUploadError(OneDriveError):
    """Graph API respondió un error durante la subida del archivo."""


def _credenciales_configuradas() -> bool:
    return bool(
        settings.AZURE_TENANT_ID
        and settings.AZURE_CLIENT_ID
        and settings.AZURE_CLIENT_SECRET
        and settings.ONEDRIVE_DRIVE_ID
    )


def _obtener_token() -> str:
    if not _credenciales_configuradas():
        raise OneDriveNoConfiguradoError(
            "OneDrive no configurado — faltan credenciales de Azure AD "
            "(AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, "
            "ONEDRIVE_DRIVE_ID). Revisar .env / .env.example."
        )

    authority = f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}"
    app = msal.ConfidentialClientApplication(
        client_id=settings.AZURE_CLIENT_ID,
        client_credential=settings.AZURE_CLIENT_SECRET,
        authority=authority,
    )
    resultado = app.acquire_token_for_client(scopes=GRAPH_SCOPE)

    if "access_token" not in resultado:
        error = resultado.get("error", "error_desconocido")
        descripcion = resultado.get("error_description", "sin descripción")
        raise OneDriveAuthError(
            f"Graph API rechazó la autenticación app-only ({error}): {descripcion}"
        )

    return resultado["access_token"]


def _nombre_destino_unico(nombre_destino: str) -> str:
    # Graph API no acepta ciertos caracteres en nombres de archivo/ruta
    # (\\ / : * ? " < > | #). Reemplazo cualquiera que aparezca por "_".
    caracteres_invalidos = '\\/:*?"<>|#'
    limpio = "".join("_" if c in caracteres_invalidos else c for c in nombre_destino)
    return f"{CARPETA_EVIDENCIAS}/{limpio}"


def _subida_simple(archivo_django, ruta_destino: str, token: str) -> dict:
    archivo_django.seek(0)
    contenido = archivo_django.read()
    content_type = (
        mimetypes.guess_type(archivo_django.name)[0] or "application/octet-stream"
    )

    url = f"{GRAPH_BASE_URL}/drives/{settings.ONEDRIVE_DRIVE_ID}/root:/{ruta_destino}:/content"
    resp = requests.put(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
        },
        data=contenido,
        timeout=60,
    )

    if resp.status_code not in (200, 201):
        raise OneDriveUploadError(
            f"Graph API respondió {resp.status_code} al subir el archivo "
            f"(simple upload): {resp.text[:500]}"
        )

    return resp.json()


def _subida_por_sesion(archivo_django, ruta_destino: str, token: str) -> dict:
    """
    Upload session por partes, para archivos >= LIMITE_SIMPLE_UPLOAD_BYTES
    (típicamente los .mp4). Sube en chunks de 5MB, tamaño recomendado por
    Microsoft Graph (debe ser múltiplo de 320 KiB).
    """
    tamanio_chunk = 5 * 1024 * 1024  # 5MB, múltiplo de 320 KiB

    url_crear_sesion = (
        f"{GRAPH_BASE_URL}/drives/{settings.ONEDRIVE_DRIVE_ID}"
        f"/root:/{ruta_destino}:/createUploadSession"
    )
    resp = requests.post(
        url_crear_sesion,
        headers={"Authorization": f"Bearer {token}"},
        json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise OneDriveUploadError(
            f"Graph API respondió {resp.status_code} al crear la upload "
            f"session: {resp.text[:500]}"
        )
    upload_url = resp.json().get("uploadUrl")
    if not upload_url:
        raise OneDriveUploadError(
            "Graph API no devolvió uploadUrl al crear la upload session."
        )

    archivo_django.seek(0)
    tamanio_total = archivo_django.size
    posicion = 0
    respuesta_final = None

    while posicion < tamanio_total:
        chunk = archivo_django.read(tamanio_chunk)
        inicio = posicion
        fin = posicion + len(chunk) - 1
        headers_chunk = {
            "Content-Length": str(len(chunk)),
            "Content-Range": f"bytes {inicio}-{fin}/{tamanio_total}",
        }
        # La upload session ya trae su propia autorización codificada en la
        # URL (es una URL firmada) — no se manda el Bearer token acá.
        resp_chunk = requests.put(
            upload_url, headers=headers_chunk, data=chunk, timeout=120
        )
        if resp_chunk.status_code not in (200, 201, 202):
            raise OneDriveUploadError(
                f"Graph API respondió {resp_chunk.status_code} al subir un "
                f"chunk (bytes {inicio}-{fin}/{tamanio_total}): "
                f"{resp_chunk.text[:500]}"
            )
        posicion += len(chunk)
        if resp_chunk.status_code in (200, 201):
            respuesta_final = resp_chunk.json()

    if respuesta_final is None:
        raise OneDriveUploadError(
            "La upload session terminó sin devolver el item final subido."
        )
    return respuesta_final


def subir_a_onedrive(archivo_django, nombre_destino: str) -> dict:
    """
    Sube un archivo (InMemoryUploadedFile o TemporaryUploadedFile de Django)
    a la carpeta de evidencias en OneDrive vía Microsoft Graph API, usando
    autenticación client-credentials (MSAL).

    Devuelve {'webUrl': ..., 'item_id': ...}.

    Lanza:
      - OneDriveNoConfiguradoError si faltan credenciales en el entorno.
      - OneDriveAuthError si Graph API rechaza la autenticación.
      - OneDriveUploadError si Graph API rechaza la subida.
    """
    token = _obtener_token()  # levanta OneDriveNoConfiguradoError / OneDriveAuthError
    ruta_destino = _nombre_destino_unico(nombre_destino)

    if archivo_django.size < LIMITE_SIMPLE_UPLOAD_BYTES:
        resultado = _subida_simple(archivo_django, ruta_destino, token)
    else:
        resultado = _subida_por_sesion(archivo_django, ruta_destino, token)

    web_url = resultado.get("webUrl")
    item_id = resultado.get("id")
    if not web_url or not item_id:
        raise OneDriveUploadError(
            f"Graph API respondió OK pero sin 'webUrl'/'id' en el body: {resultado}"
        )

    return {"webUrl": web_url, "item_id": item_id}