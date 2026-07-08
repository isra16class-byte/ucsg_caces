from rest_framework import serializers
from .models import Cohorte, PeriodoAcademico, Asignatura, Evidencia


class CohorteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cohorte
        fields = ['id', 'nombre', 'activo']


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
    archivo_url = serializers.SerializerMethodField()
    archivo_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Evidencia
        fields = [
            'id', 'asignatura', 'periodo_academico', 'tipo', 'tipo_display',
            'archivo', 'archivo_url', 'archivo_nombre', 'subido_por', 'fecha_subida', 'vigente',
        ]
        extra_kwargs = {
            'archivo': {'write_only': True},
        }

    def validate(self, data):
        tipo = data.get('tipo')
        asignatura = data.get('asignatura')
        periodo = data.get('periodo_academico')

        if tipo in Evidencia.TIPOS_POR_PERIODO:
            # EF2/EF3/EF5: evidencia institucional del PAO, no de una
            # asignatura puntual.
            if not periodo:
                raise serializers.ValidationError({
                    'periodo_academico': 'Este tipo de evidencia es institucional del PAO: se requiere "periodo_academico".',
                })
            if asignatura:
                raise serializers.ValidationError({
                    'asignatura': 'Este tipo de evidencia no debe asociarse a una asignatura específica, sino al PAO completo.',
                })
        else:
            # malla_curricular / syllabus / acta_retroalimentacion: sí
            # varían por asignatura.
            if not asignatura:
                raise serializers.ValidationError({
                    'asignatura': 'Este tipo de evidencia requiere "asignatura".',
                })
            if periodo:
                raise serializers.ValidationError({
                    'periodo_academico': 'Este tipo de evidencia no debe asociarse directamente a un periodo.',
                })
        return data

    def get_archivo_url(self, obj):
        request = self.context.get('request')
        if obj.archivo and request:
            return request.build_absolute_uri(obj.archivo.url)
        return obj.archivo.url if obj.archivo else None

    def get_archivo_nombre(self, obj):
        return obj.archivo.name.split('/')[-1] if obj.archivo else None