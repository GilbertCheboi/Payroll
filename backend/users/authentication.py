from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .phone_numbers import normalize_ke_phone_number


User = get_user_model()


class PhoneOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        identifier = attrs[self.username_field]
        try:
            phone_number = normalize_ke_phone_number(identifier)
        except ValueError:
            user = None
        else:
            user = User.objects.filter(phone_number=phone_number).first()

        if user is None:
            user = User.objects.filter(username=identifier).first()

        if user is not None:
            attrs[self.username_field] = user.get_username()

        return super().validate(attrs)


class PasswordResetScopedJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, token = result
        if not token.get("password_reset_only"):
            return result

        session_id = token.get("password_reset_session")
        session_user_id = cache.get(f"password-reset-session:{session_id}")
        if str(session_user_id) != str(user.pk):
            raise AuthenticationFailed("Password reset session has expired.")

        match = request.resolver_match
        if (
            not match
            or match.url_name != "account-me"
            or request.method not in {"GET", "PATCH"}
        ):
            raise AuthenticationFailed(
                "Password reset sessions can only access the profile password form."
            )
        if request.method == "PATCH" and set(request.data) != {"password"}:
            raise AuthenticationFailed(
                "Password reset sessions can only update the password."
            )
        return result
