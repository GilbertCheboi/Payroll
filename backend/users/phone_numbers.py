import re

from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.validators import UniqueValidator


User = get_user_model()


def normalize_ke_phone_number(value):
    value = value or ""
    if not re.fullmatch(r"\+?[0-9\s().-]+", value.strip()):
        raise ValueError(
            "Enter a Kenyan mobile number such as 0700236628 or +254700236628."
        )

    digits = re.sub(r"[\s().+-]", "", value)
    if len(digits) == 10 and digits.startswith(("07", "01")):
        digits = f"254{digits[1:]}"
    elif len(digits) == 9 and digits.startswith(("7", "1")):
        digits = f"254{digits}"

    if len(digits) != 12 or not digits.startswith("254"):
        raise ValueError(
            "Enter a Kenyan mobile number such as 0700236628 or +254700236628."
        )

    return f"+{digits}"


class KenyanPhoneNumberField(serializers.CharField):
    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 16)
        kwargs.setdefault(
            "validators",
            [UniqueValidator(queryset=User.objects.all())],
        )
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            return normalize_ke_phone_number(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error)) from error
