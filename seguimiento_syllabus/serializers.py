from rest_framework import serializers
from .models import Carrera, Cohorte, PeriodoAcademico, Asignatura, Evidencia


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
    archivo_url = serializers.SerializerMethodField()
    archivo_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Evidencia
        fields = [
            'id', 'asignatura', 'periodo_academico', 'carrera', 'tipo', 'tipo_display',
            'archivo', 'archivo_url', 'archivo_nombre', 'subido_por', 'fecha_subida', 'vigente',
        ]
        extra_kwargs = {
            'archivo': {'write_only': True},
        }

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

    def get_archivo_url(self, obj):
        request = self.context.get('request')
        if obj.archivo and request:
            return request.build_absolute_uri(obj.archivo.url)
        return obj.archivo.url if obj.archivo else None

    def get_archivo_nombre(self, obj):
        return obj.archivo.name.split('/')[-1] if obj.archivo else None