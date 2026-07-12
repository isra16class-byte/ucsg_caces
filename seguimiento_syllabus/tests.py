from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from . import views
from .models import Asignatura, Carrera, Cohorte, Evidencia, PeriodoAcademico

# Todas las pruebas de cálculo mockean _calcular_ef_desde_csv en vez de pegarle
# a la red real (Google Sheets): así son deterministas, rápidas, y no
# dependen de que el formulario siga teniendo las mismas respuestas.
DATOS_EF_VACIOS = {"ef1": 0.0, "ef4": 0.0, "respuestas": 0, "promedio_general": 0}


def _datos_ef_con_respuestas(ef1=0.5, ef4=0.5, respuestas=10, promedio=50.0):
    return {"ef1": ef1, "ef4": ef4, "respuestas": respuestas, "promedio_general": promedio}


def _archivo_evidencia():
    return SimpleUploadedFile("evidencia.pdf", b"contenido", content_type="application/pdf")


class CalculoResultadoAsignaturaTests(TestCase):
    """
    Cubre el núcleo del indicador 11.2: _calcular_resultado_generico, vía
    calcular_resultado_asignatura. Los pesos esperados (0.33/0.27/0.20/
    0.13/0.07) son los de la Tabla 14 del documento CACES, no deberían
    cambiar sin que cambie el documento oficial.
    """

    def setUp(self):
        # get_or_create, NO create(): la migración de datos
        # 0009_carrera_y_evidencia_carrera ya crea esta misma fila
        # ("Desarrollo de Software") al aplicar las migraciones, incluso en
        # la base de datos de test — un create() directo choca con la
        # restricción unique=True de Carrera.nombre.
        self.carrera, _ = Carrera.objects.get_or_create(nombre="Desarrollo de Software")
        self.cohorte = Cohorte.objects.create(carrera=self.carrera, nombre="Cohorte 2026-A")
        self.periodo = PeriodoAcademico.objects.create(cohorte=self.cohorte, nombre="PAO 1", orden=1)
        self.asignatura = Asignatura.objects.create(
            periodo_academico=self.periodo, nombre="Programación Orientada a Objetos",
        )

    @patch.object(views, "_calcular_ef_desde_csv")
    def test_sin_ninguna_evidencia_ni_encuesta_da_cero_no_none(self, mock_csv):
        """
        Sin ninguna evidencia subida y sin respuestas de encuesta, el
        resultado_final debe ser 0.0 (cada EF faltante pondera como 0), NO
        None — ese es justamente el criterio "ponderado con EF
        faltante=0" del commit e1010b2, no el todo-o-nada anterior.
        """
        mock_csv.return_value = DATOS_EF_VACIOS
        r = views.calcular_resultado_asignatura(self.asignatura)

        self.assertIsNone(r["ef1"])
        self.assertEqual(r["ef2_estado"], "sin_datos")
        self.assertEqual(r["ef3_estado"], "sin_datos")
        self.assertEqual(r["ef5_estado"], "sin_datos")
        self.assertEqual(r["resultado_final"], 0.0)
        self.assertEqual(r["estado_general"], "parcial")

    @patch.object(views, "_calcular_ef_desde_csv")
    def test_ef2_no_se_apaga_por_falta_de_ef5(self, mock_csv):
        """
        Regresión del bug documentado en el código: subir evidencia de EF2
        sin tener evidencia de EF5 NO debe borrar el valor de EF2 (antes
        aparecía "0%" en vez de "Sin datos" para EF5, y podía arrastrar a
        otros EF). Cada EF documental es independiente.
        """
        mock_csv.return_value = DATOS_EF_VACIOS
        Evidencia.objects.create(
            asignatura=self.asignatura, tipo="acta_ajuste_curricular",
            archivo=_archivo_evidencia(), vigente=True,
        )
        r = views.calcular_resultado_asignatura(self.asignatura)

        self.assertEqual(r["ef2_estado"], "ok")
        self.assertEqual(r["ef2"], 100.0)
        self.assertEqual(r["ef5_estado"], "sin_datos")
        self.assertIsNone(r["ef5"])
        # 0.27 (EF2=1.0) de peso total -> 27.0%
        self.assertEqual(r["resultado_final"], 27.0)

    @patch.object(views, "_calcular_ef_desde_csv")
    def test_ef3_es_100_por_ciento_documental_encuesta_no_lo_afecta(self, mock_csv):
        """
        EF3 se calcula SOLO desde evidencia_difusion. Si la encuesta trae
        datos (incluida cualquier pregunta que en el pasado se hubiera
        usado para EF3), eso no debe cambiar el valor de EF3 en absoluto:
        solo debe reaccionar a si se subió o no la evidencia documental.
        """
        mock_csv.return_value = _datos_ef_con_respuestas(ef1=0.9, ef4=0.9, respuestas=25)

        # Sin evidencia de difusión todavía.
        r_sin = views.calcular_resultado_asignatura(self.asignatura)
        self.assertEqual(r_sin["ef3_estado"], "sin_datos")
        self.assertIsNone(r_sin["ef3"])

        # Se sube la evidencia de difusión (EF3) y nada más cambia en la encuesta.
        Evidencia.objects.create(
            asignatura=self.asignatura, tipo="evidencia_difusion",
            archivo=_archivo_evidencia(), vigente=True,
        )
        r_con = views.calcular_resultado_asignatura(self.asignatura)
        self.assertEqual(r_con["ef3_estado"], "ok")
        self.assertEqual(r_con["ef3"], 100.0)

        # ef1 y ef4 (sí dependen de encuesta) no deberían haberse alterado por
        # subir evidencia de EF3, confirmando que EF3 está desacoplado del resto.
        self.assertEqual(r_sin["ef4"], r_con["ef4"])

    @patch.object(views, "_calcular_ef_desde_csv")
    def test_evidencia_no_vigente_no_cuenta(self, mock_csv):
        """
        Solo evidencia con vigente=True debe contar para el cálculo — una
        evidencia marcada como no vigente (ej. reemplazada por una versión
        más nueva) no debe hacer que el EF aparezca como cumplido.
        """
        mock_csv.return_value = DATOS_EF_VACIOS
        Evidencia.objects.create(
            asignatura=self.asignatura, tipo="acta_ajuste_curricular",
            archivo=_archivo_evidencia(), vigente=False,
        )
        r = views.calcular_resultado_asignatura(self.asignatura)
        self.assertEqual(r["ef2_estado"], "sin_datos")
        self.assertIsNone(r["ef2"])

    @patch.object(views, "_calcular_ef_desde_csv")
    def test_ef1_combina_encuesta_syllabus_y_malla_en_partes_iguales(self, mock_csv):
        """
        Con solo la malla curricular subida (sin syllabus, sin respuestas
        de encuesta), EF1 debe reflejar exactamente 1/3 del máximo, tal
        como documenta el commit d9ac6de (EF1 combinado 1/3 c/u).
        """
        mock_csv.return_value = DATOS_EF_VACIOS
        Evidencia.objects.create(
            carrera=self.carrera, tipo="malla_curricular",
            archivo=_archivo_evidencia(), vigente=True,
        )
        r = views.calcular_resultado_asignatura(self.asignatura)
        self.assertAlmostEqual(r["ef1"], 33.3, delta=0.1)

    @patch.object(views, "_calcular_ef_desde_csv")
    def test_todos_los_ef_completos_da_100_por_ciento(self, mock_csv):
        """
        Con encuesta al máximo y las 5 fuentes documentales presentes, el
        resultado_final debe ser 100.0 y estado_general 'completo' — sirve
        como chequeo de que los pesos (0.33+0.27+0.20+0.13+0.07) suman
        exactamente 1.00 sobre la Tabla 14 del documento CACES.
        """
        mock_csv.return_value = _datos_ef_con_respuestas(ef1=1.0, ef4=1.0, respuestas=30, promedio=100.0)
        for tipo, kwargs in [
            ("syllabus", {"asignatura": self.asignatura}),
            ("acta_ajuste_curricular", {"asignatura": self.asignatura}),
            ("evidencia_difusion", {"asignatura": self.asignatura}),
            ("malla_curricular", {"carrera": self.carrera}),
            ("reglamento_normativa", {"carrera": self.carrera}),
        ]:
            Evidencia.objects.create(tipo=tipo, archivo=_archivo_evidencia(), vigente=True, **kwargs)

        r = views.calcular_resultado_asignatura(self.asignatura)
        self.assertEqual(r["resultado_final"], 100.0)
        self.assertEqual(r["escala"], "Satisfactorio")
        self.assertEqual(r["estado_general"], "completo")


class DescargaCsvCacheTests(TestCase):
    """
    Cubre el fallback a cache cuando falla la descarga del CSV de Google
    Sheets (red caída, timeout, mantenimiento), para no perder toda la
    encuesta por una falla pasajera.
    """

    def setUp(self):
        # Cada test debe partir de un cache limpio; si no, el orden de
        # ejecución de tests afectaría el resultado (el cache es un
        # diccionario a nivel de módulo, no se resetea solo).
        views._CSV_CACHE["lines"] = None
        views._CSV_CACHE["timestamp"] = None
        views._CSV_CACHE["degradado"] = False

    def test_sin_cache_previo_y_descarga_falla_lanza_excepcion(self):
        with patch("urllib.request.urlopen", side_effect=OSError("sin red")):
            with self.assertRaises(RuntimeError):
                views._descargar_csv()

    def test_usa_cache_cuando_la_descarga_falla(self):
        # Primero, una descarga "exitosa" simulada que llena el cache.
        class RespuestaFalsa:
            def readlines(self):
                return [b"a,b,c\n", b"1,2,3\n"]

        with patch("urllib.request.urlopen", return_value=RespuestaFalsa()):
            primera = views._descargar_csv()
        self.assertEqual(primera, ["a,b,c\n", "1,2,3\n"])
        self.assertFalse(views._CSV_CACHE["degradado"])

        # Ahora la descarga falla: debe devolver la copia en cache, marcada
        # como degradada, en vez de lanzar la excepción.
        with patch("urllib.request.urlopen", side_effect=OSError("sin red")):
            segunda = views._descargar_csv()
        self.assertEqual(segunda, primera)
        self.assertTrue(views._CSV_CACHE["degradado"])

        info = views.csv_cache_info()
        self.assertTrue(info["degradado"])
        self.assertIsNotNone(info["edad_segundos"])