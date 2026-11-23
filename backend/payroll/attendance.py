from datetime import timedelta
from io import BytesIO
from math import asin, cos, isfinite, radians, sin, sqrt
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing, String
from reportlab.graphics import renderPDF
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from .documents import PDFRenderer
from .models import AttendanceShift, WorkSite
from .permissions import BillingAccessPermission
from .tenancy import organization_for


def verify_coordinates(latitude, longitude):
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise ValidationError({'detail': 'Invalid location coordinates.'})


class WorkSiteSerializer(serializers.ModelSerializer):
    radius_metres = serializers.IntegerField(min_value=10, max_value=5000)

    class Meta:
        model = WorkSite
        fields = ('id', 'name', 'latitude', 'longitude', 'radius_metres', 'time_zone', 'active')

    def validate(self, attrs):
        site = self.instance
        verify_coordinates(attrs.get('latitude', getattr(site, 'latitude', None)),
                           attrs.get('longitude', getattr(site, 'longitude', None)))
        return attrs

    def validate_time_zone(self, value):
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError):
            raise serializers.ValidationError('Enter a valid IANA time zone.')
        return value


class WorkSiteViewSet(viewsets.ModelViewSet):
    permission_classes = [BillingAccessPermission]
    serializer_class = WorkSiteSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.user.role != 'ADMIN':
            raise PermissionDenied('Only administrators can manage work sites.')

    def get_queryset(self):
        return WorkSite.objects.filter(organization=organization_for(self.request)).order_by('name')

    def perform_create(self, serializer):
        serializer.save(organization=organization_for(self.request))

    @action(detail=True, methods=['post'], url_path='rotate-qr')
    def rotate_qr(self, request, pk=None):
        site = self.get_object()
        site.qr_token = uuid4()
        site.save(update_fields=['qr_token'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='qr', renderer_classes=[JSONRenderer, PDFRenderer])
    def printable_qr(self, request, pk=None):
        site = self.get_object()
        drawing = Drawing(420, 390)
        drawing.add(String(210, 354, 'Payroll attendance', fontSize=24, textAnchor='middle'))
        drawing.add(String(210, 323, site.name, fontSize=16, textAnchor='middle'))
        drawing.add(QrCodeWidget(f'payroll-site:{site.qr_token}', x=90, y=65, barWidth=240, barHeight=240))
        drawing.add(String(210, 37, 'Scan with the payroll app to check in or out.', textAnchor='middle'))
        buffer = BytesIO()
        renderPDF.drawToFile(drawing, buffer)
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Cache-Control'] = 'private, no-store'
        response['Content-Disposition'] = f'attachment; filename="work-site-{site.pk}-qr.pdf"'
        return response


class AttendanceScanSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=80)
    action = serializers.ChoiceField(choices=['in', 'out'])
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    accuracy = serializers.FloatField()
    measured_at = serializers.DateTimeField()
    request_id = serializers.UUIDField()

    def validate(self, attrs):
        verify_coordinates(attrs['latitude'], attrs['longitude'])
        return attrs

    def validate_code(self, value):
        try:
            if not value.startswith('payroll-site:'):
                raise ValueError
            return UUID(value.split(':', 1)[1])
        except ValueError:
            raise serializers.ValidationError('Scan the printed payroll QR code for your work site.')


class AttendanceConflict(APIException):
    status_code = 409


def event(shift, action):
    site = shift.check_in_site if action == 'in' else shift.check_out_site
    time = shift.check_in_at if action == 'in' else shift.check_out_at
    return {'action': action, 'site': site.name, 'recorded_at': time.isoformat(), 'time_zone': site.time_zone}


def verify_location(data, site, now):
    accuracy = data['accuracy']
    if not isfinite(accuracy) or not 0 < accuracy <= min(50, site.radius_metres):
        raise ValidationError({'detail': 'The location is too imprecise. Move to an open area and retry.'})
    if not now - timedelta(seconds=60) <= data['measured_at'] <= now + timedelta(seconds=10):
        raise ValidationError({'detail': 'The location reading expired. Scan the QR code again.'})
    latitude, longitude = radians(data['latitude']), radians(data['longitude'])
    site_latitude, site_longitude = radians(site.latitude), radians(site.longitude)
    chord = (sin((latitude - site_latitude) / 2) ** 2 +
             cos(latitude) * cos(site_latitude) * sin((longitude - site_longitude) / 2) ** 2)
    distance = 2 * 6371000 * asin(sqrt(min(1, chord)))
    if distance > site.radius_metres:
        raise ValidationError({'detail': 'You are outside the allowed area for this work site.'})


class AttendanceView(APIView):
    permission_classes = [BillingAccessPermission]

    def get(self, request):
        shifts = AttendanceShift.objects.filter(organization=organization_for(request), employee=request.user)
        latest = shifts.select_related('check_in_site', 'check_out_site').order_by('-check_in_at', '-pk').first()
        checked_in = latest is not None and latest.check_out_at is None
        return Response({
            'checked_in': checked_in,
            'last_event': event(latest, 'in' if checked_in else 'out') if latest else None,
        })

    @transaction.atomic
    def post(self, request):
        serializer = AttendanceScanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        organization = organization_for(request)
        user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
        shifts = AttendanceShift.objects.filter(organization=organization, employee=user)
        action = data['action']
        request_field = 'check_in_request' if action == 'in' else 'check_out_request'
        previous = shifts.filter(**{request_field: data['request_id']}).first()
        if previous:
            return Response(event(previous, action), status=status.HTTP_201_CREATED)

        site = WorkSite.objects.filter(organization=organization, active=True, qr_token=data['code']).first()
        if not site:
            raise ValidationError({'detail': 'This QR code is inactive or belongs to another organization.'})
        now = timezone.now()
        verify_location(data, site, now)
        open_shift = shifts.filter(check_out_at__isnull=True).first()
        if action == 'in':
            if open_shift:
                raise AttendanceConflict('You are already checked in.')
            shift = shifts.create(organization=organization, employee=user, check_in_site=site,
                                  check_in_at=now, check_in_request=data['request_id'])
        else:
            if not open_shift:
                raise AttendanceConflict('Check in before checking out.')
            shift = open_shift
            shift.check_out_site = site
            shift.check_out_at = now
            shift.check_out_request = data['request_id']
            shift.save(update_fields=['check_out_site', 'check_out_at', 'check_out_request'])
        return Response(event(shift, action), status=status.HTTP_201_CREATED)
