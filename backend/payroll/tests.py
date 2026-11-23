import hashlib
import hmac
import json
import smtplib
from datetime import datetime
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .billing import (
    BILLING_TIME_ZONE,
    active_employee_count,
    current_invoice,
    is_billing_overdue,
)
from .billing_emails import send_monthly_invoices
from .models import (
    Department,
    EmployeeProfile,
    LeaveRequest,
    MonthlyInvoice,
    Organization,
    OrganizationBillingAccount,
    PayrollRecord,
    PayrollRun,
)


User = get_user_model()


class P9PayrollPeriodTests(TestCase):
    def test_p9_records_include_payroll_period_start_date(self):
        client = APIClient()
        organization = Organization.objects.create(
            name='P9 Test Org',
            kra_pin='A000000009A',
        )
        department = Department.objects.create(
            organization=organization,
            name='Operations',
            code='OPS',
        )
        employee = User.objects.create_user(
            username='p9-employee',
            password='Valid-P9-Password-2026!',
            role=User.Role.EMPLOYEE,
            organization=organization,
        )
        profile = EmployeeProfile.objects.create(
            user=employee,
            employee_id='P9-001',
            department=department,
            joining_date=datetime(2026, 1, 1).date(),
            base_salary=Decimal('50000.00'),
        )

        for month in (1, 2, 3):
            payroll_run = PayrollRun.objects.create(
                organization=organization,
                name=f'Payroll {month}',
                start_date=datetime(2026, month, 1).date(),
                end_date=datetime(2026, month, 28).date(),
                status=PayrollRun.Status.PROCESSED,
            )
            PayrollRecord.objects.create(
                payroll_run=payroll_run,
                employee_profile=profile,
                basic_salary=Decimal('50000.00'),
                gross_pay=Decimal('50000.00'),
            )

        client.force_authenticate(employee)
        response = client.get('/api/payroll-records/p9/?year=2026')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            [record['payroll_start_date'] for record in response.data],
            ['2026-01-01', '2026-02-01', '2026-03-01'],
        )


class OrganizationBillingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='billing-admin',
            password='Valid-Billing-Password-2026!',
            role=User.Role.ADMIN,
        )
        self.organization = Organization.objects.create(
            name='Billing Test Org',
            kra_pin='A000000001A',
            created_by=self.admin,
        )
        Organization.objects.filter(pk=self.organization.pk).update(
            created_at=timezone.now() - timedelta(days=40),
        )
        self.organization.refresh_from_db()
        self.admin.organization = self.organization
        self.admin.save(update_fields=['organization'])
        self.admin.organizations.add(self.organization)
        self.department = Department.objects.create(
            organization=self.organization,
            name='Operations',
            code='OPS',
        )
        self.client.force_authenticate(self.admin)

    def add_employee(self, username, employee_id, *, active=True, role=User.Role.EMPLOYEE):
        user = User.objects.create_user(
            username=username,
            password='Valid-Billing-Password-2026!',
            role=role,
            is_active=active,
            organization=self.organization,
        )
        if role == User.Role.EMPLOYEE:
            EmployeeProfile.objects.create(
                user=user,
                employee_id=employee_id,
                department=self.department,
                joining_date=timezone.localdate(),
                base_salary=Decimal('50000.00'),
            )
        return user

    def test_invoice_counts_only_active_employee_profiles(self):
        self.add_employee('active-employee', 'ACTIVE-001')
        self.add_employee('inactive-employee', 'INACTIVE-001', active=False)
        self.add_employee('hr-user', 'HR-001', role=User.Role.HR)

        invoice = current_invoice(self.organization)

        self.assertEqual(active_employee_count(self.organization), 1)
        self.assertEqual(invoice.employee_count, 1)
        self.assertEqual(invoice.price_per_employee, Decimal('200.00'))
        self.assertEqual(invoice.amount, Decimal('200.00'))
        self.assertEqual(invoice.status, MonthlyInvoice.Status.DUE)

    def test_new_rate_recalculates_unpaid_invoices(self):
        self.add_employee('rate-change-employee', 'RATE-001')
        invoice = current_invoice(self.organization)
        invoice.price_per_employee = Decimal('100.00')
        invoice.amount = Decimal('100.00')
        invoice.save(update_fields=['price_per_employee', 'amount'])

        updated_invoice = current_invoice(self.organization)

        self.assertEqual(updated_invoice.pk, invoice.pk)
        self.assertEqual(updated_invoice.employee_count, 1)
        self.assertEqual(updated_invoice.price_per_employee, Decimal('200.00'))
        self.assertEqual(updated_invoice.amount, Decimal('200.00'))

    def test_zero_employee_invoice_is_paid_without_payment(self):
        invoice = current_invoice(self.organization)

        self.assertEqual(invoice.amount, Decimal('0.00'))
        self.assertEqual(invoice.status, MonthlyInvoice.Status.PAID)
        self.assertIsNotNone(invoice.paid_at)

    def test_backfills_each_calendar_month_from_registration_month(self):
        self.add_employee('historical-employee', 'HISTORICAL-001')
        registration = datetime(2026, 7, 15, 14, 8, 44, tzinfo=BILLING_TIME_ZONE)
        Organization.objects.filter(pk=self.organization.pk).update(
            created_at=registration,
        )
        self.organization.refresh_from_db()
        OrganizationBillingAccount.objects.create(
            organization=self.organization,
            billing_started_at=timezone.now(),
        )
        current_time = datetime(2026, 10, 21, 12, 0, tzinfo=BILLING_TIME_ZONE)

        from .billing import ensure_invoices_through, outstanding_amount

        ensure_invoices_through(self.organization, current_time)
        invoices = list(
            self.organization.billing_invoices.order_by('period_start')
        )

        self.assertEqual(
            [
                timezone.localtime(
                    invoice.period_start,
                    BILLING_TIME_ZONE,
                ).month
                for invoice in invoices
            ],
            [7, 8, 9],
        )
        self.assertEqual(
            [
                timezone.localtime(
                    invoice.period_start,
                    BILLING_TIME_ZONE,
                ).day
                for invoice in invoices
            ],
            [1, 1, 1],
        )
        self.assertEqual(
            outstanding_amount(self.organization, current_time=current_time),
            Decimal('600.00'),
        )

    def test_invoice_is_overdue_after_grace_through_seventh(self):
        self.add_employee('grace-period-employee', 'GRACE-001')
        registration = datetime(2026, 9, 15, 9, 0, tzinfo=BILLING_TIME_ZONE)
        Organization.objects.filter(pk=self.organization.pk).update(
            created_at=registration,
        )
        self.organization.refresh_from_db()
        before_deadline = datetime(2026, 10, 7, 23, 59, 59, tzinfo=BILLING_TIME_ZONE)
        after_deadline = datetime(2026, 10, 8, 0, 0, tzinfo=BILLING_TIME_ZONE)

        self.assertFalse(is_billing_overdue(self.organization, before_deadline))
        self.assertTrue(is_billing_overdue(self.organization, after_deadline))

    def test_overdue_organization_is_read_only_but_can_access_billing(self):
        OrganizationBillingAccount.objects.create(
            organization=self.organization,
            billing_started_at=timezone.now() - timedelta(days=8),
        )
        self.add_employee('overdue-employee', 'OVERDUE-001')

        self.assertTrue(is_billing_overdue(self.organization))
        response = self.client.post(
            '/api/departments/',
            {'name': 'Finance', 'code': 'FIN'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

        billing_response = self.client.get('/api/billing/')
        self.assertEqual(billing_response.status_code, 200)
        self.assertEqual(
            billing_response.data['current_invoice']['status'],
            'OVERDUE',
        )

    @patch('payroll.billing_views.initiate_payment', return_value='provider-request-1')
    def test_admin_can_start_payment_for_organization_invoice(self, initiate_payment):
        self.add_employee('payable-employee', 'PAYABLE-001')
        invoice = current_invoice(self.organization)

        response = self.client.post(
            '/api/billing/pay/',
            {
                'invoice_id': str(invoice.id),
                'phone_number': '0712345678',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, MonthlyInvoice.Status.PROCESSING)
        self.assertEqual(invoice.payment_request_id, 'provider-request-1')
        initiate_payment.assert_called_once()

    @override_settings(KOPOKOPO_CLIENT_SECRET='billing-webhook-secret')
    def test_signed_payment_callback_pays_matching_invoice(self):
        self.add_employee('callback-employee', 'CALLBACK-001')
        invoice = current_invoice(self.organization)
        invoice.status = MonthlyInvoice.Status.PROCESSING
        invoice.payment_request_id = 'provider-request-2'
        invoice.save(update_fields=['status', 'payment_request_id'])
        payload = {
            'data': {
                'id': 'provider-request-2',
                'attributes': {
                    'status': 'Success',
                    'metadata': {'reference': str(invoice.id)},
                    'event': {
                        'resource': {
                            'amount': '200.0',
                            'currency': 'KES',
                            'status': 'Received',
                            'reference': 'MPESA-REF-123',
                        }
                    },
                },
            }
        }
        body = json.dumps(payload).encode()
        signature = hmac.new(
            b'billing-webhook-secret',
            body,
            hashlib.sha256,
        ).hexdigest()

        response = self.client.post(
            '/api/billing/kopokopo/webhook/',
            body,
            content_type='application/json',
            HTTP_X_KOPOKOPO_SIGNATURE=signature,
        )

        self.assertEqual(response.status_code, 200)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, MonthlyInvoice.Status.PAID)
        self.assertEqual(invoice.transaction_reference, 'MPESA-REF-123')

    @override_settings(KOPOKOPO_CLIENT_SECRET='billing-webhook-secret')
    def test_invalid_webhook_signature_cannot_mark_invoice_paid(self):
        self.add_employee('unsigned-employee', 'UNSIGNED-001')
        invoice = current_invoice(self.organization)
        invoice.status = MonthlyInvoice.Status.PROCESSING
        invoice.save(update_fields=['status'])
        body = json.dumps(
            {
                'data': {
                    'id': str(invoice.id),
                    'attributes': {'status': 'Success'},
                }
            }
        )

        response = self.client.post(
            '/api/billing/kopokopo/webhook/',
            body,
            content_type='application/json',
            HTTP_X_KOPOKOPO_SIGNATURE='invalid-signature',
        )

        self.assertEqual(response.status_code, 403)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, MonthlyInvoice.Status.PROCESSING)


class LeaveManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.organization = Organization.objects.create(
            name='Leave Test Org',
            kra_pin='A000000002A',
        )
        self.department = Department.objects.create(
            organization=self.organization,
            name='Operations',
            code='OPS',
        )
        self.employee = User.objects.create_user(
            username='leave-employee',
            password='Valid-Leave-Password-2026!',
            role=User.Role.EMPLOYEE,
            organization=self.organization,
        )
        self.profile = EmployeeProfile.objects.create(
            user=self.employee,
            employee_id='LEAVE-001',
            department=self.department,
            joining_date=timezone.localdate(),
            base_salary=Decimal('50000.00'),
        )
        self.hr = User.objects.create_user(
            username='leave-hr',
            password='Valid-Leave-Password-2026!',
            role=User.Role.HR,
            organization=self.organization,
        )
        self.admin = User.objects.create_user(
            username='leave-admin',
            password='Valid-Leave-Password-2026!',
            role=User.Role.ADMIN,
            organization=self.organization,
        )

    def submit_request(self, **overrides):
        payload = {
            'leave_type': LeaveRequest.LeaveType.ANNUAL,
            'start_date': '2026-11-02',
            'end_date': '2026-11-04',
            'reason': 'Family commitment',
        }
        payload.update(overrides)
        return self.client.post('/api/leaves/', payload, format='json')

    def test_employee_can_submit_and_only_sees_own_request(self):
        self.client.force_authenticate(self.employee)

        response = self.submit_request(
            employee_profile=9999,
            organization=9999,
            status=LeaveRequest.Status.APPROVED,
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['days_requested'], 3)
        self.assertEqual(response.data['status'], LeaveRequest.Status.PENDING)
        self.assertEqual(LeaveRequest.objects.get().employee_profile, self.profile)
        self.assertEqual(self.client.get('/api/leaves/').data['results'][0]['employee_id'], 'LEAVE-001')

    def test_employee_cannot_review_and_hr_can_approve(self):
        leave_request = LeaveRequest.objects.create(
            organization=self.organization,
            employee_profile=self.profile,
            leave_type=LeaveRequest.LeaveType.SICK,
            start_date='2026-11-02',
            end_date='2026-11-02',
            reason='Medical appointment',
        )
        self.client.force_authenticate(self.employee)

        denied = self.client.post(f'/api/leaves/{leave_request.pk}/approve/', {}, format='json')

        self.assertEqual(denied.status_code, 403)
        self.client.force_authenticate(self.hr)
        approved = self.client.post(
            f'/api/leaves/{leave_request.pk}/approve/',
            {'review_note': 'Approved'},
            format='json',
        )

        self.assertEqual(approved.status_code, 200)
        leave_request.refresh_from_db()
        self.assertEqual(leave_request.status, LeaveRequest.Status.APPROVED)
        self.assertEqual(leave_request.reviewed_by, self.hr)
        self.assertIsNotNone(leave_request.reviewed_at)
        self.assertEqual(leave_request.review_note, 'Approved')

    def test_admin_can_reject_and_reviewed_request_cannot_be_changed(self):
        leave_request = LeaveRequest.objects.create(
            organization=self.organization,
            employee_profile=self.profile,
            leave_type=LeaveRequest.LeaveType.ANNUAL,
            start_date='2026-11-02',
            end_date='2026-11-03',
            reason='Family commitment',
        )
        self.client.force_authenticate(self.admin)

        rejected = self.client.post(
            f'/api/leaves/{leave_request.pk}/reject/',
            {'review_note': 'Please select different dates.'},
            format='json',
        )

        self.assertEqual(rejected.status_code, 200)
        leave_request.refresh_from_db()
        self.assertEqual(leave_request.status, LeaveRequest.Status.REJECTED)
        self.assertEqual(leave_request.reviewed_by, self.admin)

        second_review = self.client.post(
            f'/api/leaves/{leave_request.pk}/approve/',
            {},
            format='json',
        )
        self.assertEqual(second_review.status_code, 400)
        leave_request.refresh_from_db()
        self.assertEqual(leave_request.status, LeaveRequest.Status.REJECTED)

    def test_employee_cannot_submit_invalid_or_overlapping_dates(self):
        self.client.force_authenticate(self.employee)

        invalid_dates = self.submit_request(end_date='2026-11-01')
        self.assertEqual(invalid_dates.status_code, 400)

        LeaveRequest.objects.create(
            organization=self.organization,
            employee_profile=self.profile,
            leave_type=LeaveRequest.LeaveType.ANNUAL,
            start_date='2026-11-03',
            end_date='2026-11-05',
            reason='Existing leave',
        )
        overlapping = self.submit_request()
        self.assertEqual(overlapping.status_code, 400)

    def test_dashboard_counts_unique_employees_currently_on_approved_leave(self):
        today = timezone.localdate()
        second_employee = User.objects.create_user(
            username='leave-second-employee',
            password='Valid-Leave-Password-2026!',
            role=User.Role.EMPLOYEE,
            organization=self.organization,
        )
        second_profile = EmployeeProfile.objects.create(
            user=second_employee,
            employee_id='LEAVE-003',
            department=self.department,
            joining_date=today,
            base_salary=Decimal('50000.00'),
        )
        current_leave = {
            'organization': self.organization,
            'leave_type': LeaveRequest.LeaveType.ANNUAL,
            'start_date': today,
            'end_date': today,
            'reason': 'Current leave',
            'status': LeaveRequest.Status.APPROVED,
        }
        LeaveRequest.objects.create(
            employee_profile=self.profile,
            **current_leave,
        )
        LeaveRequest.objects.create(
            employee_profile=self.profile,
            **current_leave,
        )
        LeaveRequest.objects.create(
            employee_profile=second_profile,
            **current_leave,
        )
        LeaveRequest.objects.create(
            employee_profile=self.profile,
            **{
                **current_leave,
                'start_date': today - timedelta(days=2),
                'end_date': today - timedelta(days=1),
                'reason': 'Past leave',
            },
        )
        LeaveRequest.objects.create(
            employee_profile=self.profile,
            **{
                **current_leave,
                'start_date': today + timedelta(days=1),
                'end_date': today + timedelta(days=2),
                'reason': 'Future leave',
            },
        )
        LeaveRequest.objects.create(
            employee_profile=self.profile,
            **{
                **current_leave,
                'reason': 'Pending leave',
                'status': LeaveRequest.Status.PENDING,
            },
        )

        self.client.force_authenticate(self.hr)
        response = self.client.get('/api/dashboard/summary/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['metrics']['peopleOnLeave'], 2)

    def test_hr_cannot_review_request_from_another_organization(self):
        other_organization = Organization.objects.create(
            name='Other Leave Org',
            kra_pin='A000000003A',
        )
        other_department = Department.objects.create(
            organization=other_organization,
            name='Finance',
            code='FIN',
        )
        other_employee = User.objects.create_user(
            username='other-leave-employee',
            password='Valid-Leave-Password-2026!',
            role=User.Role.EMPLOYEE,
            organization=other_organization,
        )
        other_profile = EmployeeProfile.objects.create(
            user=other_employee,
            employee_id='LEAVE-002',
            department=other_department,
            joining_date=timezone.localdate(),
            base_salary=Decimal('50000.00'),
        )
        leave_request = LeaveRequest.objects.create(
            organization=other_organization,
            employee_profile=other_profile,
            leave_type=LeaveRequest.LeaveType.ANNUAL,
            start_date='2026-11-02',
            end_date='2026-11-02',
            reason='Family commitment',
        )
        self.client.force_authenticate(self.hr)

        response = self.client.post(f'/api/leaves/{leave_request.pk}/approve/', {}, format='json')

        self.assertEqual(response.status_code, 404)
        leave_request.refresh_from_db()
        self.assertEqual(leave_request.status, LeaveRequest.Status.PENDING)


class EmployeePhoneOnboardingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='phone-onboarding-admin',
            password='Valid-Phone-Password-2026!',
            role=User.Role.ADMIN,
        )
        self.organization = Organization.objects.create(
            name='Phone Onboarding Org',
            kra_pin='A000000004A',
            created_by=self.admin,
        )
        self.admin.organization = self.organization
        self.admin.save(update_fields=['organization'])
        self.admin.organizations.add(self.organization)
        self.department = Department.objects.create(
            organization=self.organization,
            name='Operations',
            code='OPS',
        )
        self.client.force_authenticate(self.admin)

    def test_employee_onboarding_normalizes_and_saves_phone_number(self):
        response = self.client.post(
            '/api/employees/',
            {
                'username': 'phone-onboarded-employee',
                'password': 'Valid-Phone-Employee-2026!',
                'first_name': 'Phone',
                'last_name': 'Employee',
                'email': 'phone-employee@example.com',
                'phone_number': '254700236628',
                'payroll_profile': {
                    'employee_id': 'PHONE-001',
                    'kra_pin': 'b123456789c',
                    'department': self.department.pk,
                    'joining_date': '2026-10-01',
                    'base_salary': '50000.00',
                },
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['phone_number'], '+254700236628')
        self.assertEqual(response.data['payroll_profile']['kra_pin'], 'B123456789C')
        self.assertEqual(response.data['organization_name'], 'Phone Onboarding Org')
        self.assertEqual(response.data['organization_kra_pin'], 'A000000004A')
        self.assertEqual(
            User.objects.get(username='phone-onboarded-employee').phone_number,
            '+254700236628',
        )
        self.assertEqual(
            User.objects.get(username='phone-onboarded-employee').payroll_profile.kra_pin,
            'B123456789C',
        )
        employee = User.objects.get(username='phone-onboarded-employee')
        self.client.force_authenticate(employee)
        profile_response = self.client.get('/api/employees/me/')
        self.assertEqual(profile_response.status_code, 200, profile_response.data)
        self.assertEqual(profile_response.data['organization_kra_pin'], 'A000000004A')


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class BillingInvoiceEmailTests(TestCase):
    def setUp(self):
        self.current_time = datetime(
            2026,
            10,
            31,
            12,
            0,
            tzinfo=BILLING_TIME_ZONE,
        )
        self.admin = User.objects.create_user(
            username='invoice-admin',
            password='Valid-Billing-Password-2026!',
            email='billing@example.com',
            role=User.Role.ADMIN,
        )
        self.organization = Organization.objects.create(
            name='Invoice Test Org',
            kra_pin='A000000005A',
            created_by=self.admin,
        )
        Organization.objects.filter(pk=self.organization.pk).update(
            created_at=datetime(
                2026,
                10,
                1,
                0,
                0,
                tzinfo=BILLING_TIME_ZONE,
            ),
        )
        self.organization.refresh_from_db()
        self.admin.organizations.add(self.organization)

    def test_current_invoice_is_emailed_with_a_downloadable_pdf_once(self):
        sent, skipped, failed = send_monthly_invoices(self.current_time)

        self.assertEqual((sent, skipped, failed), (1, 0, 0))
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['billing@example.com'])
        self.assertEqual(len(message.attachments), 1)
        filename, pdf_content, content_type = message.attachments[0]
        invoice = self.organization.billing_invoices.get()
        self.assertEqual(filename, f'invoice-{invoice.pk}.pdf')
        self.assertEqual(content_type, 'application/pdf')
        self.assertTrue(pdf_content.startswith(b'%PDF'))

        sent, skipped, failed = send_monthly_invoices(self.current_time)

        self.assertEqual((sent, skipped, failed), (0, 1, 0))
        self.assertEqual(len(mail.outbox), 1)

    def test_smtp_failure_is_not_marked_as_sent(self):
        with patch(
            'payroll.billing_emails.EmailMessage.send',
            side_effect=smtplib.SMTPException('SMTP unavailable'),
        ), self.assertLogs('payroll.billing_emails', level='ERROR'):
            sent, skipped, failed = send_monthly_invoices(self.current_time)

        self.assertEqual((sent, skipped, failed), (0, 0, 1))
        invoice = self.organization.billing_invoices.get()
        self.assertIsNone(invoice.email_sent_at)
