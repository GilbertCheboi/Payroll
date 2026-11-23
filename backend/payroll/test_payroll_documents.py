from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Department, EmployeeProfile, Organization, PayrollRecord, PayrollRun


class PayslipDownloadTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name='Payroll Documents', kra_pin='A000000018B')
        self.department = Department.objects.create(organization=self.organization, name='Ops', code='OPS')
        self.owner = get_user_model().objects.create_user(username='document-owner', organization=self.organization)
        self.profile = EmployeeProfile.objects.create(
            user=self.owner, employee_id='DOC01', department=self.department, joining_date=date(2026, 1, 1), base_salary=50000
        )
        self.run = PayrollRun.objects.create(
            organization=self.organization, name='March payroll', start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 31), status=PayrollRun.Status.PROCESSED,
        )
        self.record = PayrollRecord.objects.create(
            payroll_run=self.run, employee_profile=self.profile, net_pay='37000.50'
        )
        self.client = APIClient()
        self.url = f'/api/payroll-records/{self.record.pk}/payslip/'

    def test_owner_downloads_private_pdf(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(self.url, HTTP_ACCEPT='application/pdf')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertIn('no-store', response['Cache-Control'])
        self.assertTrue(response.content.startswith(b'%PDF'))

    def test_other_employee_cannot_download(self):
        other = get_user_model().objects.create_user(username='other', organization=self.organization)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_records_in_other_organizations_are_hidden(self):
        self.client.force_authenticate(self.owner)
        other = Organization.objects.create(name='Other employer', kra_pin='A000000019B')
        self.run.organization = other
        self.run.save(update_fields=['organization'])
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.get('/api/payroll-records/me/').json(), [])

    def test_p9_downloads_for_owner_and_selected_year(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get('/api/payroll-records/p9/pdf/?year=2026', HTTP_ACCEPT='application/pdf')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b'%PDF'))
        self.assertEqual(self.client.get('/api/payroll-records/p9/pdf/?year=invalid').status_code, 400)

    def test_draft_run_cannot_be_downloaded(self):
        self.run.status = PayrollRun.Status.DRAFT
        self.run.save(update_fields=['status'])
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_financial_csv_requires_hr_access_and_escapes_formula_cells(self):
        url = f'/api/reports/financial/?payroll_run_id={self.run.pk}&type=bank&download=csv'
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(url).status_code, 403)

        self.profile.bank_name = '=untrusted'
        self.profile.bank_account = '00001234'
        self.profile.save(update_fields=['bank_name', 'bank_account'])
        admin = get_user_model().objects.create_user(
            username='document-admin', organization=self.organization, role='ADMIN',
        )
        self.client.force_authenticate(admin)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn("'=untrusted,00001234", response.content.decode())
