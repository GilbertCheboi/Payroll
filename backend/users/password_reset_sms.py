import hmac
import logging
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.tokens import AccessToken

from .sms import send_sms


User = get_user_model()
logger = logging.getLogger(__name__)
CODE_TTL_SECONDS = 300
CODE_COOLDOWN_SECONDS = 60
MAX_CODE_ATTEMPTS = 5
RESET_SESSION_TTL_SECONDS = 600


def _phone_key(kind, phone_number):
    digest = salted_hmac(
        f"password-reset-sms-{kind}",
        phone_number,
        secret=settings.SECRET_KEY,
        algorithm="sha256",
    ).hexdigest()
    return f"password-reset-sms:{kind}:{digest}"


def _code_hash(phone_number, code):
    return salted_hmac(
        "password-reset-sms-code",
        f"{phone_number}:{code}",
        secret=settings.SECRET_KEY,
        algorithm="sha256",
    ).hexdigest()


def request_phone_reset_code(user, phone_number):
    cooldown_key = _phone_key("cooldown", phone_number)
    if not cache.add(cooldown_key, True, timeout=CODE_COOLDOWN_SECONDS):
        return

    if user is None:
        return

    code = f"{secrets.randbelow(1_000_000):06d}"
    cache.delete(_phone_key("consumed", phone_number))
    cache.set(
        _phone_key("code", phone_number),
        {"user_id": user.pk, "code_hash": _code_hash(phone_number, code)},
        timeout=CODE_TTL_SECONDS,
    )
    cache.set(_phone_key("attempts", phone_number), 0, timeout=CODE_TTL_SECONDS)

    try:
        send_sms(
            phone_number,
            f"Your Agrieldo password reset verification code is {code}. "
            "It expires in 5 minutes. Do not share this code.",
        )
    except (ImproperlyConfigured, OSError):
        cache.delete(_phone_key("code", phone_number))
        cache.delete(_phone_key("attempts", phone_number))
        cache.delete(cooldown_key)
        logger.exception("Password reset verification SMS delivery failed.")


def verify_phone_reset_code(phone_number, code):
    code_key = _phone_key("code", phone_number)
    challenge = cache.get(code_key)
    attempts_key = _phone_key("attempts", phone_number)
    if not challenge:
        raise ValidationError({"code": "This code is invalid or has expired."})

    expected_hash = challenge["code_hash"]
    submitted_hash = _code_hash(phone_number, code)
    if not hmac.compare_digest(expected_hash, submitted_hash):
        try:
            attempts = cache.incr(attempts_key)
        except ValueError:
            attempts = MAX_CODE_ATTEMPTS
        if attempts >= MAX_CODE_ATTEMPTS:
            cache.delete(code_key)
            cache.delete(attempts_key)
        raise ValidationError({"code": "This code is invalid or has expired."})

    user = User.objects.filter(
        pk=challenge["user_id"],
        phone_number=phone_number,
        is_active=True,
    ).first()
    if user is None:
        cache.delete(code_key)
        cache.delete(attempts_key)
        raise ValidationError({"code": "This code is invalid or has expired."})

    session_id = secrets.token_urlsafe(32)
    if not cache.add(
        _phone_key("consumed", phone_number),
        True,
        timeout=CODE_TTL_SECONDS,
    ):
        raise ValidationError({"code": "This code is invalid or has expired."})

    cache.delete(code_key)
    cache.delete(attempts_key)
    cache.set(
        f"password-reset-session:{session_id}",
        challenge["user_id"],
        timeout=RESET_SESSION_TTL_SECONDS,
    )
    token = AccessToken.for_user(user)
    token.set_exp(lifetime=timedelta(seconds=RESET_SESSION_TTL_SECONDS))
    token["password_reset_only"] = True
    token["password_reset_session"] = session_id
    return {"access": str(token)}
