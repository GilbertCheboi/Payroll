from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def send_sms(phone_number, message):
    if not all(
        (
            settings.SMS_API_KEY,
            settings.SMS_PARTNER_ID,
            settings.SMS_SHORTCODE,
        )
    ):
        raise ImproperlyConfigured(
            "SMS_API_KEY, SMS_PARTNER_ID, and SMS_SHORTCODE must be configured."
        )

    payload = urlencode(
        {
            "apikey": settings.SMS_API_KEY,
            "partnerID": settings.SMS_PARTNER_ID,
            "shortcode": settings.SMS_SHORTCODE,
            "mobile": phone_number,
            "message": message,
        }
    ).encode("utf-8")
    request = Request(
        settings.SMS_GATEWAY_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        response.read()
