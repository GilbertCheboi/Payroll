# backend/users/serializers.py
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode

from rest_framework import serializers

from payroll.models import Organization
from payroll.serializers import OrganizationSerializer, EmployeeProfileSerializer
from .phone_numbers import KenyanPhoneNumberField

User = get_user_model()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetPhoneRequestSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=32)

    def validate_phone_number(self, value):
        from .phone_numbers import normalize_ke_phone_number

        try:
            return normalize_ke_phone_number(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error)) from error


class PasswordResetPhoneVerifySerializer(PasswordResetPhoneRequestSerializer):
    code = serializers.RegexField(r"^\d{6}$")


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User._default_manager.get(pk=user_id)
        except (
            TypeError,
            ValueError,
            OverflowError,
            UnicodeDecodeError,
            User.DoesNotExist,
        ) as error:
            raise serializers.ValidationError(
                {"token": "This password reset link is invalid or has expired."}
            ) from error

        if not user.is_active or not default_token_generator.check_token(
            user,
            attrs["token"],
        ):
            raise serializers.ValidationError(
                {"token": "This password reset link is invalid or has expired."}
            )

        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": error.messages}) from error

        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        with transaction.atomic():
            user = User._default_manager.select_for_update().get(
                pk=self.validated_data["user"].pk
            )
            if (
                not user.is_active
                or not default_token_generator.check_token(
                    user,
                    self.validated_data["token"],
                )
            ):
                raise serializers.ValidationError(
                    {"token": "This password reset link is invalid or has expired."}
                )
            user.set_password(self.validated_data["new_password"])
            user.save(update_fields=["password"])
        return user


class UserAccountSerializer(serializers.ModelSerializer):
    phone_number = KenyanPhoneNumberField(required=False, allow_null=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    organizations = serializers.SerializerMethodField()
    payroll_profile = EmployeeProfileSerializer(required=False)

    def validate_password(self, value):
        try:
            validate_password(value, user=self.instance)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages) from error
        return value

    def get_organizations(self, user):
        organizations = Organization.objects.filter(
            Q(members=user) | Q(created_by=user)
        ).distinct().order_by('id')
        return OrganizationSerializer(organizations, many=True).data

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'password',
            'first_name',
            'last_name',
            'email',
            'phone_number',
            'role',
            'organization_name',
            'organizations',
            'payroll_profile',
        ]
        extra_kwargs = {
            'password': {'write_only': True} # Prevents password hashes from leaking in GET requests
        }

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        instance = self.Meta.model(**validated_data)
        if password is not None:
            instance.set_password(password)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        payroll_data = validated_data.pop('payroll_profile', None)

        instance = super().update(instance, validated_data)
        if password is not None:
            instance.set_password(password)
            instance.save()

        if payroll_data:
            payroll_profile = getattr(instance, 'payroll_profile', None)
            if payroll_profile:
                EmployeeProfileSerializer().update(payroll_profile, payroll_data)
        return instance


class AdminRegistrationSerializer(serializers.ModelSerializer):
    phone_number = KenyanPhoneNumberField()
    company_profile = OrganizationSerializer(write_only=True)

    class Meta:
        model = User
        fields = [
            'username',
            'password',
            'first_name',
            'last_name',
            'email',
            'phone_number',
            'company_profile',
        ]
        extra_kwargs = {
            'password': {'write_only': True}
        }

    def validate(self, attrs):
        user_data = {
            field: attrs.get(field, '')
            for field in ('username', 'first_name', 'last_name', 'email', 'phone_number')
        }
        try:
            validate_password(attrs['password'], user=User(**user_data))
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': error.messages}) from error
        return attrs

    def create(self, validated_data):
        company_data = validated_data.pop('company_profile')

        with transaction.atomic():
            password = validated_data.pop('password')
            user = User(**validated_data, role=User.Role.ADMIN)
            user.set_password(password)
            user.save()

            organization = Organization.objects.create(
                **company_data,
                created_by=user,
            )
            user.organization = organization
            user.save(update_fields=['organization'])
            user.organizations.add(organization)

        return user
