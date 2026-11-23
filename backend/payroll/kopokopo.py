import hashlib
import hmac
import json
import logging
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache


logger = logging.getLogger(__name__)
ACCESS_TOKEN_CACHE_KEY = 'kopokopo_access_token'
USER_AGENT = 'PayrollMatrix/1.0'


class KopoKopoError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def integration_configured():
    return all(
        (
            settings.KOPOKOPO_CLIENT_ID,
            settings.KOPOKOPO_CLIENT_SECRET,
            settings.KOPOKOPO_TILL_NUMBER,
            settings.KOPOKOPO_CALLBACK_URL,
        )
    )


def _request(url, data=None, access_token=None, content_type='application/json'):
    headers = {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
    }
    if data is not None:
        headers['Content-Type'] = content_type
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'

    request = Request(url, data=data, headers=headers, method='POST' if data is not None else 'GET')
    try:
        with urlopen(request, timeout=15) as response:
            response_body = response.read()
            response_headers = response.headers
    except HTTPError as error:
        logger.warning('Kopo Kopo returned HTTP %s.', error.code)
        raise KopoKopoError(
            f'Kopo Kopo rejected the request (HTTP {error.code}).',
            status_code=error.code,
        ) from error
    except (URLError, TimeoutError) as error:
        logger.warning('Kopo Kopo request could not be completed.')
        raise KopoKopoError('Unable to reach Kopo Kopo. Please try again.') from error

    try:
        response_data = json.loads(response_body) if response_body else {}
    except json.JSONDecodeError as error:
        logger.warning('Kopo Kopo returned an invalid JSON response.')
        raise KopoKopoError('Kopo Kopo returned an invalid response.') from error
    return response_data, response_headers


def _access_token():
    token = cache.get(ACCESS_TOKEN_CACHE_KEY)
    if token:
        return token
    if not settings.KOPOKOPO_CLIENT_ID or not settings.KOPOKOPO_CLIENT_SECRET:
        raise KopoKopoError('Kopo Kopo credentials are not configured on the server.')

    token_data = urlencode(
        {
            'client_id': settings.KOPOKOPO_CLIENT_ID,
            'client_secret': settings.KOPOKOPO_CLIENT_SECRET,
            'grant_type': 'client_credentials',
        }
    ).encode()
    response, _ = _request(
        f'{settings.KOPOKOPO_BASE_URL}/oauth/token',
        data=token_data,
        content_type='application/x-www-form-urlencoded',
    )
    token = response.get('access_token')
    if not token:
        raise KopoKopoError('Kopo Kopo did not return an access token.')
    cache.set(ACCESS_TOKEN_CACHE_KEY, token, max(int(response.get('expires_in', 3600)) - 60, 60))
    return token


def _authorized_request(url, data=None):
    token = _access_token()
    try:
        return _request(url, data=data, access_token=token)
    except KopoKopoError as error:
        if error.status_code != 401:
            raise

    cache.delete(ACCESS_TOKEN_CACHE_KEY)
    return _request(url, data=data, access_token=_access_token())


def normalize_phone_number(phone_number):
    digits = re.sub(r'\D', '', phone_number or '')
    if digits.startswith('0') and len(digits) == 10:
        digits = f'254{digits[1:]}'
    elif len(digits) == 9:
        digits = f'254{digits}'
    if len(digits) != 12 or not digits.startswith('254'):
        raise ValueError('Enter a valid Kenyan mobile number, such as 0712345678.')
    return f'+{digits}'


def initiate_payment(invoice, user, phone_number, amount=None):
    if not integration_configured():
        raise KopoKopoError(
            'Kopo Kopo billing is not configured. Contact the system administrator.'
        )

    try:
        normalized_phone = normalize_phone_number(phone_number)
    except ValueError as error:
        raise KopoKopoError(str(error)) from error

    body = {
        'payment_channel': 'M-PESA STK Push',
        'till_number': settings.KOPOKOPO_TILL_NUMBER,
        'subscriber': {
            'first_name': user.first_name or 'Payroll',
            'last_name': user.last_name or 'Administrator',
            'phone_number': normalized_phone,
        },
        'amount': {
            'currency': 'KES',
            'value': int(amount if amount is not None else invoice.amount),
        },
        'metadata': {
            'reference': str(invoice.id),
            'notes': f'PayrollMatrix subscription {invoice.period_start:%Y-%m}',
        },
        '_links': {
            'callback_url': settings.KOPOKOPO_CALLBACK_URL,
        },
    }
    _, response_headers = _authorized_request(
        f'{settings.KOPOKOPO_BASE_URL}/api/v2/incoming_payments',
        data=json.dumps(body).encode(),
    )

    location = response_headers.get('Location', '')
    parsed_location = urlparse(location)
    expected_host = urlparse(settings.KOPOKOPO_BASE_URL).netloc
    match = re.fullmatch(
        r'/api/v2/incoming_payments/([A-Za-z0-9_-]+)',
        parsed_location.path,
    )
    if (
        parsed_location.scheme != 'https'
        or parsed_location.netloc != expected_host
        or not match
    ):
        raise KopoKopoError('Kopo Kopo returned an invalid payment request reference.')
    return match.group(1)


def payment_request_status(request_id):
    if not re.fullmatch(r'[A-Za-z0-9_-]+', request_id or ''):
        raise KopoKopoError('Invalid Kopo Kopo payment request reference.')
    response, _ = _authorized_request(
        f'{settings.KOPOKOPO_BASE_URL}/api/v2/incoming_payments/{request_id}',
    )
    return response.get('data', {}).get('attributes', {})


def verify_webhook_signature(request_body, signature):
    if not settings.KOPOKOPO_CLIENT_SECRET or not signature:
        return False
    expected_signature = hmac.new(
        settings.KOPOKOPO_CLIENT_SECRET.encode(),
        request_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected_signature, signature)
