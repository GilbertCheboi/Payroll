from django.db.models.deletion import ProtectedError
# backend/users/views.py
import logging
import smtplib

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import PasswordResetForm
from django.core.cache import cache
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .authentication import PhoneOrUsernameTokenObtainPairSerializer
from .serializers import (
    PasswordResetConfirmSerializer,
    PasswordResetPhoneRequestSerializer,
    PasswordResetPhoneVerifySerializer,
    PasswordResetRequestSerializer,
    UserAccountSerializer,
)
from .password_reset_sms import request_phone_reset_code, verify_phone_reset_code

from payroll.permissions import BillingAccessPermission
from payroll.serializers import OrganizationSerializer
from payroll.tenancy import active_organization

User = get_user_model()
logger = logging.getLogger(__name__)


class PhoneOrUsernameTokenObtainPairView(TokenObtainPairView):
    serializer_class = PhoneOrUsernameTokenObtainPairSerializer


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        form = PasswordResetForm(data=serializer.validated_data)
        if not form.is_valid():
            raise ValidationError(form.errors)
        try:
            form.save(
                request=request,
                use_https=request.is_secure(),
                from_email=settings.DEFAULT_FROM_EMAIL,
                email_template_name="users/password_reset_email.txt",
                subject_template_name="users/password_reset_subject.txt",
                extra_email_context={"frontend_url": settings.FRONTEND_URL},
            )
        except (OSError, smtplib.SMTPException):
            logger.exception("Password reset email delivery failed.")

        return Response(
            {
                "detail": (
                    "If an account with that email exists, password reset "
                    "instructions have been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetPhoneRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_phone_request"

    def post(self, request):
        serializer = PasswordResetPhoneRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone_number = serializer.validated_data["phone_number"]
        user = User.objects.filter(
            phone_number=phone_number,
            is_active=True,
        ).first()
        request_phone_reset_code(user, phone_number)

        return Response(
            {
                "detail": (
                    "If an active account matches that phone number, "
                    "a verification code has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetPhoneVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_phone_verify"

    def post(self, request):
        serializer = PasswordResetPhoneVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tokens = verify_phone_reset_code(
            serializer.validated_data["phone_number"],
            serializer.validated_data["code"],
        )
        return Response(tokens, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_confirm"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Your password has been reset. You can now sign in."},
            status=status.HTTP_200_OK,
        )


class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserAccountSerializer
    permission_classes = [BillingAccessPermission]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            if request.user.role not in ('ADMIN', 'HR') or not active_organization(request):
                raise PermissionDenied('Only administrators and HR can manage accounts.')
            if request.user.role != 'ADMIN' and request.data.get('role') in ('ADMIN', 'ACCOUNTANT'):
                raise PermissionDenied('Only administrators can assign that role.')

    def perform_create(self, serializer):
        serializer.save(organization=active_organization(self.request))

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            instance.is_active = False
            instance.save(update_fields=['is_active'])

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        organization = active_organization(self.request)
        if user.role in ['ADMIN', 'HR'] and organization:
            queryset = queryset.filter(organization=organization)
            if user.role == 'HR':
                queryset = queryset.exclude(role__in=('ADMIN', 'ACCOUNTANT'))
        else:
            queryset = queryset.filter(pk=user.pk)
        # Enable optional filtering via query parameters: /api/accounts/?role=HR
        role_filter = self.request.query_params.get('role')
        if role_filter:
            queryset = queryset.filter(role=role_filter)
        username_filter = self.request.query_params.get('username')
        if username_filter:
            queryset = queryset.filter(username=username_filter)
        return queryset

    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        if request.method == 'GET':
            if (request.auth or {}).get("password_reset_only"):
                return Response(
                    {
                        "username": request.user.username,
                        "first_name": request.user.first_name,
                        "last_name": request.user.last_name,
                        "role": request.user.role,
                    }
                )
            serializer = self.get_serializer(request.user)
            return Response(serializer.data)

        if (request.auth or {}).get("password_reset_only") and set(request.data) != {"password"}:
            raise ValidationError(
                {"detail": "Only the password can be updated in this reset session."}
            )
        if 'role' in request.data:
            raise PermissionDenied('Only administrators can change your account role.')
        if 'payroll_profile' in request.data:
            raise PermissionDenied('Use employee management to update payroll details.')
        serializer = self.get_serializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if (request.auth or {}).get("password_reset_only"):
            session_id = request.auth.get("password_reset_session")
            cache.delete(f"password-reset-session:{session_id}")
        return Response(serializer.data)

    @action(detail=False, methods=['get', 'patch'], url_path='organization')
    def organization_settings(self, request):
        if request.user.role not in ['ADMIN', 'HR']:
            return Response({'detail': 'Only admins and HR users can update organization settings.'}, status=403)

        organization = active_organization(request)
        if not organization:
            return Response({'detail': 'No active organization found.'}, status=404)

        if request.method == 'GET':
            return Response(OrganizationSerializer(organization).data)

        serializer = OrganizationSerializer(organization, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# backend/users/views.py
from rest_framework import generics
from rest_framework.permissions import AllowAny
from .serializers import AdminRegistrationSerializer

class AdminSignupView(generics.CreateAPIView):
    serializer_class = AdminRegistrationSerializer
    permission_classes = [AllowAny] # Unblocked public gate entry