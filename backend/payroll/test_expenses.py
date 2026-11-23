from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Organization


class ExpenseWorkflowTests(TestCase):
    def setUp(self):
        user = get_user_model()
        self.organization = Organization.objects.create(name='Expense company', kra_pin='P000000040C')
        self.employee = user.objects.create_user(username='traveler', organization=self.organization)
        self.accountant = user.objects.create_user(
            username='reviewer', organization=self.organization, role='ACCOUNTANT',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.employee)

    def test_submit_approve_and_record_one_reimbursement(self):
        response = self.client.post('/api/expenses/', {
            'purpose': 'Field visit', 'duty_date': str(timezone.localdate()),
        })
        self.assertEqual(response.status_code, 201, response.data)
        url = f"/api/expenses/{response.data['id']}/"
        response = self.client.post(url + 'lines/', {
            'category': 'transport', 'amount': '750.25',
            'receipt': SimpleUploadedFile('ticket.pdf', b'%PDF-1.7\n', content_type='application/pdf'),
        })
        self.assertEqual(response.status_code, 201, response.data)
        receipt = url + f"lines/{response.data['id']}/receipt/"
        self.assertEqual(self.client.post(url + 'submit/').status_code, 200)
        self.assertEqual(self.client.post(url + 'review/', {'decision': 'approved'}).status_code, 403)

        self.client.force_authenticate(self.accountant)
        self.assertTrue(self.client.get(receipt).content.startswith(b'%PDF'))
        self.assertEqual(self.client.post(url + 'review/', {'decision': 'approved'}).status_code, 200)

        payment = {'method': 'mpesa', 'paid_on': str(timezone.localdate()), 'reference': 'TEST-123'}
        response = self.client.post(url + 'reimburse/', payment)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['reimbursement']['amount'], '750.25')
        self.assertEqual(self.client.post(url + 'reimburse/', payment).status_code, 400)
        self.assertEqual(self.client.patch('/api/accounts/me/', {'role': 'ADMIN'}).status_code, 403)

        self.client.force_authenticate(self.employee)
        response = self.client.get(url)
        self.assertEqual(response.data['status'], 'reimbursed')
        self.assertEqual(response.data['reimbursement']['method'], 'mpesa')
        self.assertEqual(self.client.post(url + 'reimburse/', payment).status_code, 403)

        outsider = get_user_model().objects.create_user(username='outsider', role='ACCOUNTANT')
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(receipt).status_code, 403)

        outsider.organization = Organization.objects.create(name='Other employer', kra_pin='P000000042C')
        outsider.save(update_fields=['organization'])
        self.assertEqual(self.client.get(receipt).status_code, 404)

    def test_only_admin_can_create_accountant_in_organization(self):
        data = {'username': 'additional-accountant', 'password': 'A-strong-Example-2026!', 'role': 'ACCOUNTANT'}
        self.assertEqual(self.client.post('/api/accounts/', data).status_code, 403)

        admin = get_user_model().objects.create_user(
            username='expense-admin', role='ADMIN', organization=self.organization,
        )
        self.client.force_authenticate(admin)
        response = self.client.post('/api/accounts/', data)
        self.assertEqual(response.status_code, 201, response.data)
        created = get_user_model().objects.get(username=data['username'])
        self.assertEqual(created.organization, self.organization)
        self.assertTrue(created.check_password(data['password']))

    def test_future_duty_date_is_rejected(self):
        future_date = timezone.localdate() + timedelta(days=3)
        response = self.client.post('/api/expenses/', {
            'purpose': 'Future duty', 'duty_date': str(future_date),
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('duty_date', response.data)

    def test_accounts_with_expense_history_are_deactivated(self):
        response = self.client.post('/api/expenses/', {
            'purpose': 'Recorded claim', 'duty_date': str(timezone.localdate()),
        })
        self.assertEqual(response.status_code, 201)
        admin = get_user_model().objects.create_user(
            username='deactivation-admin', role='ADMIN', organization=self.organization,
        )
        self.client.force_authenticate(admin)
        response = self.client.delete(f'/api/accounts/{self.employee.pk}/')
        self.assertEqual(response.status_code, 204)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_active)
