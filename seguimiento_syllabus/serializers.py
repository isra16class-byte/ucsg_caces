from rest_framework import serializers
from django.urls import reverse
from .models import Carrera, Cohorte, PeriodoAcademico, Asignatura, Evidencia
from .onedrive_service import subir_a_onedrive, construir_ruta_carpetas, construir_nombre_archivo


class CarreraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Carrera
        fields = ['id', 'nombre']


class CohorteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cohorte
        fields = ['id', 'carrera', 'nombre', 'activo']


class PeriodoAcademicoSerializer(serializers.ModelSerializer):
    class Meta:
        model = PeriodoAcademico
        fields = ['id', 'cohorte', 'nombre', 'orden', 'fecha_inicio', 'fecha_fin']


class AsignaturaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asignatura
        fields = ['id', 'periodo_academico', 'nombre', 'docente']


class EvidenciaSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    # NOTA (integración OneDrive, renombrado confirmado por el usuario el
    # 12 de julio de 2026): la salida del API usa "onedrive_url" /
    # "onedrive_nombre" en vez de "archivo_url" / "archivo_nombre" —
    # nombres más honestos ahora que el archivo vive en OneDrive y no en
    # el servidor local. Requiere que el frontend (App.tsx) lea estos
    # nombres nuevos (ver ese archivo, se actualizó en el mismo cambio).
    onedrive_url = serializers.SerializerMethodField()
    onedrive_nombre = serializers.SerializerMethodField()
    # vista_previa_url: URL propia (same-origin) para el <iframe> del
    # frontend, que hace de proxy del archivo real en OneDrive — ver
    # api_views.evidencia_archivo. onedrive_url (el link público de
    # Microsoft) sigue siendo el que usa el botón "Abrir documento", que
    # ya funciona bien; este campo nuevo es SOLO para resolver el bloqueo
    # de CSP que Microsoft impone sobre embeber sus propias páginas en un
    # iframe de otro origen. None si la evidencia todavía no tiene
    # archivo en OneDrive (histórica sin migrar).
    vista_previa_url = serializers.SerializerMethodField()
    # write_only: sigue recibiendo el archivo tal cual lo manda el
    # formulario del frontend (multipart/form-data), pero create() lo
    # intercepta y lo sube a OneDrive en vez de guardarlo en el modelo.
    archivo = serializers.FileField(write_only=True, required=True)

    class Meta:
        model = Evidencia
        fields = [
            'id', 'asignatura', 'periodo_academico', 'carrera', 'tipo', 'tipo_display',
            'archivo', 'onedrive_url', 'onedrive_nombre', 'vista_previa_url',
            'subido_por', 'fecha_subida', 'vigente',
        ]

    def create(self, validated_data):
        archivo_django = validated_data.pop('archivo')
        tipo = validated_data.get('tipo')
        # Organiza el archivo en OneDrive replicando la jerarquía real
        # (Carrera / Cohorte / PAO / Asignatura, o "Evidencia General de
        # Carrera" para EF5) en vez de dejarlo plano en una sola carpeta —
        # ver construir_ruta_carpetas() en onedrive_service.py. El nombre
        # del archivo dentro de esa carpeta lleva tipo + timestamp para
        # que dos subidas del mismo tipo/contexto nunca se pisen entre sí.
        carpetas = construir_ruta_carpetas(
            carrera=validated_data.get('carrera'),
            periodo_academico=validated_data.get('periodo_academico'),
            asignatura=validated_data.get('asignatura'),
        )
        nombre_archivo = construir_nombre_archivo(tipo, archivo_django.name)

        resultado = subir_a_onedrive(archivo_django, carpetas, nombre_archivo)

        validated_data['onedrive_url'] = resultado['webUrl']
        validated_data['onedrive_item_id'] = resultado['item_id']
        validated_data['nombre_archivo_original'] = archivo_django.name
        return Evidencia.objects.create(**validated_data)

    def validate(self, data):
        tipo = data.get('tipo')
        asignatura = data.get('asignatura')
        periodo = data.get('periodo_academico')
        carrera = data.get('carrera')

        if tipo in Evidencia.TIPOS_POR_CARRERA:
            # malla_curricular / reglamento_normativa (EF5): evidencia de
            # TODA la carrera, no de una asignatura ni un PAO puntual.
            if not carrera:
                raise serializers.ValidationError({
                    'carrera': 'Este tipo de evidencia es de nivel carrera: se requiere "carrera".',
                })
            if asignatura or periodo:
                raise serializers.ValidationError({
                    'asignatura': 'Este tipo de evidencia no debe asociarse a una asignatura ni a un periodo académico, sino a la carrera completa.',
                })
        elif tipo in Evidencia.TIPOS_POR_PERIODO:
            # Hoy no hay ningún tipo en este set — se deja implementado por
            # si a futuro EF4 suma evidencia documental propia de nivel PAO.
            if not periodo:
                raise serializers.ValidationError({
                    'periodo_academico': 'Este tipo de evidencia es institucional del PAO: se requiere "periodo_academico".',
                })
            if asignatura or carrera:
                raise serializers.ValidationError({
                    'asignatura': 'Este tipo de evidencia no debe asociarse a una asignatura ni a una carrera, sino al PAO completo.',
                })
        else:
            # syllabus / acta_retroalimentacion / acta_ajuste_curricular
            # (EF2) / evidencia_difusion (EF3): varían por asignatura.
            if not asignatura:
                raise serializers.ValidationError({
                    'asignatura': 'Este tipo de evidencia requiere "asignatura".',
                })
            if periodo or carrera:
                raise serializers.ValidationError({
                    'periodo_academico': 'Este tipo de evidencia no debe asociarse directamente a un periodo ni a una carrera.',
                })
        return data

    def get_onedrive_url(self, obj):
        if obj.onedrive_url:
            return obj.onedrive_url
        # Evidencia histórica (subida antes de la migración a OneDrive) que
        # todavía no pasó por migrar_evidencia_a_onedrive.py --aplicar.
        request = self.context.get('request')
        if obj.archivo and request:
            return request.build_absolute_uri(obj.archivo.url)
        return obj.archivo.url if obj.archivo else None

    def get_onedrive_nombre(self, obj):
        if obj.nombre_archivo_original:
            return obj.nombre_archivo_original
        # Evidencia histórica sin migrar todavía.
        return obj.archivo.name.split('/')[-1] if obj.archivo else None

    def get_vista_previa_url(self, obj):
        if not obj.onedrive_item_id:
            return None
        path = reverse('evidencia_archivo', kwargs={'evidencia_id': obj.id})
        request = self.context.get('request')
        return request.build_absolute_uri(path) if request else path