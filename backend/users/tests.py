import smtplib
from urllib.parse import parse_qs
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core import mail
from django.test import TestCase
from django.urls import reverse
from django.test.utils import override_settings
from rest_framework.test import APIClient

from payroll.models import Organization
from users.sms import send_sms


User = get_user_model()


class AdminSignupTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.signup_url = reverse('admin_signup')
        self.payload = {
            'username': 'company-owner',
            'password': 'Safer-Example-Pass-842!',
            'first_name': 'Company',
            'last_name': 'Owner',
            'email': 'owner@example.com',
            'phone_number': '0700236628',
            'company_profile': {
                'name': 'Example Company',
                'kra_pin': 'A123456789B',
                'currency': 'Ksh',
                'theme_color': '#10b981',
            },
        }

    def test_signup_creates_organization_admin_without_django_staff_access(self):
        response = self.client.post(self.signup_url, self.payload, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(username=self.payload['username'])
        organization = Organization.objects.get(kra_pin='A123456789B')
        self.assertEqual(user.role, User.Role.ADMIN)
        self.assertEqual(user.phone_number, '+254700236628')
        self.assertTrue(user.check_password(self.payload['password']))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.organization, organization)
        self.assertEqual(organization.created_by, user)
        self.assertIn(organization, user.organizations.all())

        token_response = self.client.post(
            reverse('token_obtain_pair'),
            {
                'username': self.payload['username'],
                'password': self.payload['password'],
            },
            format='json',
        )
        self.assertEqual(token_response.status_code, 200, token_response.data)

        phone_token_response = self.client.post(
            reverse('token_obtain_pair'),
            {
                'username': '+254 700 236 628',
                'password': self.payload['password'],
            },
            format='json',
        )
        self.assertEqual(phone_token_response.status_code, 200, phone_token_response.data)

    def test_signup_rejects_duplicate_organization_kra_pin_atomically(self):
        self.client.post(self.signup_url, self.payload, format='json')
        duplicate_payload = {
            **self.payload,
            'username': 'another-owner',
            'email': 'another@example.com',
        }

        response = self.client.post(
            self.signup_url,
            duplicate_payload,
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(Organization.objects.count(), 1)

    def test_signup_rejects_weak_password(self):
        weak_password_payload = {**self.payload, 'password': 'password'}

        response = self.client.post(
            self.signup_url,
            weak_password_payload,
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.exists())
        self.assertFalse(Organization.objects.exists())

    def test_signup_rejects_invalid_organization_kra_pin(self):
        invalid_payload = {
            **self.payload,
            'company_profile': {
                **self.payload['company_profile'],
                'kra_pin': 'not-a-kra-pin',
            },
        }

        response = self.client.post(self.signup_url, invalid_payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('company_profile', response.data)
        self.assertFalse(User.objects.exists())
        self.assertFalse(Organization.objects.exists())

    def test_signup_rejects_duplicate_phone_number(self):
        self.client.post(self.signup_url, self.payload, format='json')
        duplicate_payload = {
            **self.payload,
            'username': 'another-owner',
            'email': 'another@example.com',
            'company_profile': {
                **self.payload['company_profile'],
                'kra_pin': 'A123456788B',
            },
        }

        response = self.client.post(self.signup_url, duplicate_payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('phone_number', response.data)


class OrganizationSettingsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='organization-settings-admin',
            password='Valid-Organization-Password-2026!',
            role=User.Role.ADMIN,
        )
        self.organization = Organization.objects.create(
            name='Settings Company',
            kra_pin='A123456789B',
            created_by=self.admin,
        )
        self.admin.organization = self.organization
        self.admin.save(update_fields=['organization'])
        self.admin.organizations.add(self.organization)
        self.client.force_authenticate(self.admin)
        self.url = '/api/accounts/organization/'

    def test_admin_can_update_organization_details(self):
        response = self.client.patch(
            self.url,
            {
                'name': 'Updated Settings Company',
                'kra_pin': 'b123456789c',
                'currency': 'USD',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['name'], 'Updated Settings Company')
        self.assertEqual(response.data['kra_pin'], 'B123456789C')
        self.assertEqual(response.data['currency'], 'USD')
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.kra_pin, 'B123456789C')

    def test_organization_update_rejects_duplicate_kra_pin(self):
        Organization.objects.create(
            name='Other Settings Company',
            kra_pin='C123456789D',
        )

        response = self.client.patch(
            self.url,
            {'kra_pin': 'C123456789D'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.kra_pin, 'A123456789B')


class PhoneLoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='phone-login-user',
            phone_number='+254700236628',
            password='Valid-Phone-Password-2026!',
        )
        self.token_url = reverse('token_obtain_pair')

    def test_login_accepts_local_and_international_phone_formats(self):
        for identifier in ('0700236628', '254700236628', '+254700236628'):
            with self.subTest(identifier=identifier):
                response = self.client.post(
                    self.token_url,
                    {
                        'username': identifier,
                        'password': 'Valid-Phone-Password-2026!',
                    },
                    format='json',
                )
                self.assertEqual(response.status_code, 200, response.data)

    def test_login_continues_to_accept_username(self):
        response = self.client.post(
            self.token_url,
            {
                'username': 'phone-login-user',
                'password': 'Valid-Phone-Password-2026!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)


@override_settings(
    SMS_GATEWAY_URL='https://sms.example.test/send',
    SMS_API_KEY='test-api-key',
    SMS_PARTNER_ID='test-partner',
    SMS_SHORTCODE='TEST',
)
class SMSGatewayTests(TestCase):
    @patch('users.sms.urlopen')
    def test_sends_form_encoded_message_to_gateway(self, urlopen):
        send_sms('+254700236628', 'Reset password: https://example.test/reset')

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, 'https://sms.example.test/send')
        self.assertEqual(request.method, 'POST')
        self.assertEqual(
            request.get_header('Content-type'),
            'application/x-www-form-urlencoded',
        )
        self.assertEqual(
            parse_qs(request.data.decode('utf-8')),
            {
                'apikey': ['test-api-key'],
                'partnerID': ['test-partner'],
                'shortcode': ['TEST'],
                'mobile': ['+254700236628'],
                'message': ['Reset password: https://example.test/reset'],
            },
        )


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='Agrieldo Payroll <info@agrieldo.com>',
    FRONTEND_URL='https://payroll.agrieldo.com',
    SMS_GATEWAY_URL='https://sms.example.test/send',
    SMS_API_KEY='test-api-key',
    SMS_PARTNER_ID='test-partner',
    SMS_SHORTCODE='TEST',
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'password-reset-tests',
        },
    },
)
class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='password-reset-user',
            email='reset@example.com',
            phone_number='+254700236628',
            password='Original-Strong-Password-2026!',
        )
        self.request_url = reverse('password_reset')
        self.confirm_url = reverse('password_reset_confirm')
        self.phone_request_url = reverse('password_reset_phone')
        self.phone_verify_url = reverse('password_reset_phone_verify')
        self.send_sms = patch('users.password_reset_sms.send_sms')
        self.mock_send_sms = self.send_sms.start()
        self.addCleanup(self.send_sms.stop)
        cache.clear()

    def test_reset_request_sends_link_without_disclosing_account_existence(self):
        response = self.client.post(
            self.request_url,
            {'email': self.user.email},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data['detail'],
            'If an account with that email exists, password reset instructions have been sent.',
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.user.email])
        self.assertIn('https://payroll.agrieldo.com/#reset?uid=', mail.outbox[0].body)
        self.assertIn('&token=', mail.outbox[0].body)
        self.mock_send_sms.assert_not_called()

    def test_reset_request_for_unknown_email_returns_same_response_without_sending(self):
        response = self.client.post(
            self.request_url,
            {'email': 'unknown@example.com'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data['detail'],
            'If an account with that email exists, password reset instructions have been sent.',
        )
        self.assertEqual(len(mail.outbox), 0)
        self.mock_send_sms.assert_not_called()

    @patch('users.password_reset_sms.secrets.randbelow', return_value=123456)
    def test_phone_reset_sends_verification_code_without_sending_email(self, generate_code):
        response = self.client.post(
            self.phone_request_url,
            {'phone_number': '0700236628'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('If an active account matches', response.data['detail'])
        self.mock_send_sms.assert_called_once()
        self.assertEqual(self.mock_send_sms.call_args.args[0], self.user.phone_number)
        self.assertIn('123456', self.mock_send_sms.call_args.args[1])
        self.assertEqual(len(mail.outbox), 0)
        generate_code.assert_called_once_with(1_000_000)

    def test_phone_reset_request_does_not_disclose_unknown_numbers(self):
        response = self.client.post(
            self.phone_request_url,
            {'phone_number': '0700111222'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('If an active account matches', response.data['detail'])
        self.mock_send_sms.assert_not_called()
        self.assertEqual(len(mail.outbox), 0)

    @patch('users.password_reset_sms.secrets.randbelow', return_value=123456)
    def test_sms_delivery_failure_does_not_expose_account_or_leave_a_valid_code(
        self,
        generate_code,
    ):
        self.mock_send_sms.side_effect = OSError('SMS gateway unavailable')
        with self.assertLogs('users.password_reset_sms', level='ERROR'):
            response = self.client.post(
                self.phone_request_url,
                {'phone_number': self.user.phone_number},
                format='json',
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn('If an active account matches', response.data['detail'])
        verify_response = self.client.post(
            self.phone_verify_url,
            {'phone_number': self.user.phone_number, 'code': '123456'},
            format='json',
        )
        self.assertEqual(verify_response.status_code, 400)
        generate_code.assert_called_once_with(1_000_000)

    @patch('users.password_reset_sms.secrets.randbelow', return_value=123456)
    def test_verified_phone_opens_scoped_profile_and_password_change(self, generate_code):
        self.client.post(
            self.phone_request_url,
            {'phone_number': self.user.phone_number},
            format='json',
        )
        verify_response = self.client.post(
            self.phone_verify_url,
            {'phone_number': '0700236628', 'code': '123456'},
            format='json',
        )
        self.assertEqual(verify_response.status_code, 200, verify_response.data)
        access_token = verify_response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')

        profile_response = self.client.get(reverse('account-me'))
        self.assertEqual(profile_response.status_code, 200, profile_response.data)
        self.assertEqual(profile_response.data['username'], self.user.username)
        denied_response = self.client.get(reverse('dashboard-summary'))
        self.assertEqual(denied_response.status_code, 401)
        denied_profile_update = self.client.patch(
            reverse('account-me'),
            {
                'password': 'New-Strong-Password-2026!',
                'email': 'attacker@example.com',
            },
            format='json',
        )
        self.assertEqual(denied_profile_update.status_code, 401)

        new_password = 'New-Strong-Password-2026!'
        update_response = self.client.patch(
            reverse('account-me'),
            {'password': new_password},
            format='json',
        )
        self.assertEqual(update_response.status_code, 200, update_response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))
        expired_session_response = self.client.get(reverse('account-me'))
        self.assertEqual(expired_session_response.status_code, 401)
        generate_code.assert_called_once_with(1_000_000)

    @patch('users.password_reset_sms.secrets.randbelow', return_value=123456)
    def test_phone_reset_code_is_single_use(self, generate_code):
        self.client.post(
            self.phone_request_url,
            {'phone_number': self.user.phone_number},
            format='json',
        )
        payload = {'phone_number': self.user.phone_number, 'code': '123456'}
        first_response = self.client.post(
            self.phone_verify_url,
            payload,
            format='json',
        )
        second_response = self.client.post(
            self.phone_verify_url,
            payload,
            format='json',
        )

        self.assertEqual(first_response.status_code, 200, first_response.data)
        self.assertEqual(second_response.status_code, 400)

    @patch('users.password_reset_sms.secrets.randbelow', return_value=123456)
    def test_phone_reset_code_expires_after_five_incorrect_attempts(self, generate_code):
        self.client.post(
            self.phone_request_url,
            {'phone_number': self.user.phone_number},
            format='json',
        )
        for _ in range(5):
            response = self.client.post(
                self.phone_verify_url,
                {'phone_number': self.user.phone_number, 'code': '999999'},
                format='json',
            )
            self.assertEqual(response.status_code, 400)

        correct_code_response = self.client.post(
            self.phone_verify_url,
            {'phone_number': self.user.phone_number, 'code': '123456'},
            format='json',
        )
        self.assertEqual(correct_code_response.status_code, 400)
        generate_code.assert_called_once_with(1_000_000)

    @patch(
        'users.views.PasswordResetForm.save',
        side_effect=smtplib.SMTPException('SMTP unavailable'),
    )
    def test_mail_failure_keeps_account_existence_private(self, send_reset_email):
        with self.assertLogs('users.views', level='ERROR'):
            response = self.client.post(
                self.request_url,
                {'email': self.user.email},
                format='json',
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data['detail'],
            'If an account with that email exists, password reset instructions have been sent.',
        )
        send_reset_email.assert_called_once()

    def test_reset_link_changes_password_and_cannot_be_reused(self):
        self.client.post(
            self.request_url,
            {'email': self.user.email},
            format='json',
        )
        reset_link = next(
            line
            for line in mail.outbox[0].body.splitlines()
            if line.startswith('https://payroll.agrieldo.com/#reset?')
        )
        query = reset_link.split('?', 1)[1]
        uid, token = (
            part.split('=', 1)[1]
            for part in query.split('&')
        )
        new_password = 'New-Strong-Password-2026!'

        response = self.client.post(
            self.confirm_url,
            {
                'uid': uid,
                'token': token,
                'new_password': new_password,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))

        reused_link = self.client.post(
            self.confirm_url,
            {
                'uid': uid,
                'token': token,
                'new_password': 'Another-Strong-Password-2026!',
            },
            format='json',
        )
        self.assertEqual(reused_link.status_code, 400)
