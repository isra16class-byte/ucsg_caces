from rest_framework import serializers
from .models import Cohorte, Asignatura, Evidencia, PreguntaEncuesta, RespuestaEncuesta


class CohorteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cohorte
        fields = ['id', 'nombre', 'activo']


class AsignaturaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asignatura
        fields = ['id', 'cohorte', 'nombre', 'docente']


class EvidenciaSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    archivo_url = serializers.SerializerMethodField()
    archivo_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Evidencia
        fields = [
            'id', 'asignatura', 'tipo', 'tipo_display',
            'archivo', 'archivo_url', 'archivo_nombre', 'fecha_subida',
        ]
        extra_kwargs = {
            'archivo': {'write_only': True},
        }

    def get_archivo_url(self, obj):
        request = self.context.get('request')
        if obj.archivo and request:
            return request.build_absolute_uri(obj.archivo.url)
        return obj.archivo.url if obj.archivo else None

    def get_archivo_nombre(self, obj):
        return obj.archivo.name.split('/')[-1] if obj.archivo else None


class PreguntaEncuestaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PreguntaEncuesta
        fields = ['id', 'texto', 'orden']


class RespuestaEncuestaSerializer(serializers.ModelSerializer):
    class Meta:
        model = RespuestaEncuesta
        fields = ['id', 'pregunta', 'cohorte', 'respuesta_si', 'respuesta_no']
