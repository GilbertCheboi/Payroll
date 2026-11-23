from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Organization, WorkSite


class AttendanceTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name='HQ', kra_pin='P000000041M')
        self.site = WorkSite.objects.create(
            organization=self.organization, name='Main Office', latitude=-1.2864,
            longitude=36.8172, radius_metres=100,
        )
        user = get_user_model().objects.create_user(username='staff', organization=self.organization)
        self.client = APIClient()
        self.client.force_authenticate(user)
        self.payload = {
            'code': f'payroll-site:{self.site.qr_token}', 'action': 'in',
            'latitude': -1.2864, 'longitude': 36.8172, 'accuracy': 7,
            'measured_at': timezone.now().isoformat(),
            'request_id': 'c55e58b9-2b21-49da-ad3b-ad8a66af9b64',
        }

    def scan(self, **changes):
        return self.client.post('/api/attendance/', {**self.payload, **changes}, format='json')

    def test_check_in_retry_and_check_out(self):
        first = self.scan()
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(self.scan().data, first.data)
        self.assertEqual(self.scan(request_id='c55e58b9-2b21-49da-ad3b-ad8a66af9b65').status_code, 409)
        last = self.scan(action='out', request_id='c55e58b9-2b21-49da-ad3b-ad8a66af9b66')
        self.assertEqual(last.status_code, 201)
        self.assertFalse(self.client.get('/api/attendance/').data['checked_in'])

    def test_unverified_location_cannot_check_in(self):
        self.assertEqual(self.scan(latitude=-1.31).status_code, 400)
        self.assertEqual(self.scan(accuracy=150).status_code, 400)
        self.assertFalse(self.client.get('/api/attendance/').data['checked_in'])

    def test_employee_cannot_manage_site_codes(self):
        self.assertEqual(self.client.get('/api/work-sites/').status_code, 403)

    def test_admin_prints_and_rotates_site_qr(self):
        admin = get_user_model().objects.create_user(
            username='attendance-admin', organization=self.organization, role='ADMIN',
        )
        self.client.force_authenticate(admin)
        url = f'/api/work-sites/{self.site.pk}/'
        response = self.client.get(url + 'qr/', HTTP_ACCEPT='application/pdf')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b'%PDF'))
        self.assertEqual(self.client.post(url + 'rotate-qr/').status_code, 204)
        self.site.refresh_from_db()
        self.assertNotEqual(self.payload['code'], f'payroll-site:{self.site.qr_token}')
        self.assertEqual(self.scan().status_code, 400)
