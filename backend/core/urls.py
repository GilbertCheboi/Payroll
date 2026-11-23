from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)

from payroll.attendance import AttendanceView, WorkSiteViewSet
from payroll.expenses import ExpenseClaimViewSet
from payroll.views import (
    DepartmentViewSet,
    EmployeeOnboardingViewSet,
    OrganizationViewSet,
    PayrollRunViewSet,
    PayrollRecordViewSet,
    LeaveRequestViewSet,
    DashboardSummaryView,  # Regular APIView, routed manually below
    FinancialReportsView,
)
from payroll.billing_views import (
    CheckBillingPaymentView,
    InitiateBillingPaymentView,
    KopoKopoWebhookView,
    OrganizationBillingView,
)
from users.views import (
    PasswordResetConfirmView,
    PasswordResetPhoneRequestView,
    PasswordResetPhoneVerifyView,
    PasswordResetRequestView,
    PhoneOrUsernameTokenObtainPairView,
    UserManagementViewSet,
    AdminSignupView,
)

# 1. Register ViewSets only in the Router
router = DefaultRouter()
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'accounts', UserManagementViewSet, basename='account')
router.register(r'employees', EmployeeOnboardingViewSet, basename='employee')
router.register(r'organization', OrganizationViewSet, basename='organization')
router.register(r'payroll-runs', PayrollRunViewSet, basename='payrollrun')
router.register(r'payroll-records', PayrollRecordViewSet, basename='payrollrecord')
router.register(r'expenses', ExpenseClaimViewSet, basename='expense')
router.register(r'work-sites', WorkSiteViewSet, basename='work-site')
router.register(r'leaves', LeaveRequestViewSet, basename='leave')

urlpatterns = [
    path('api/attendance/', AttendanceView.as_view(), name='attendance'),
    path('admin/', admin.site.urls),
    path('api/auth/signup/', AdminSignupView.as_view(), name='admin_signup'),
    path(
        'api/auth/password-reset/',
        PasswordResetRequestView.as_view(),
        name='password_reset',
    ),
    path(
        'api/auth/password-reset/confirm/',
        PasswordResetConfirmView.as_view(),
        name='password_reset_confirm',
    ),
    path(
        'api/auth/password-reset/phone/',
        PasswordResetPhoneRequestView.as_view(),
        name='password_reset_phone',
    ),
    path(
        'api/auth/password-reset/phone/verify/',
        PasswordResetPhoneVerifyView.as_view(),
        name='password_reset_phone_verify',
    ),
    path('api/billing/', OrganizationBillingView.as_view(), name='organization-billing'),
    path('api/billing/pay/', InitiateBillingPaymentView.as_view(), name='billing-payment'),
    path(
        'api/billing/invoices/<uuid:invoice_id>/check/',
        CheckBillingPaymentView.as_view(),
        name='billing-payment-check',
    ),
    path(
        'api/billing/kopokopo/webhook/',
        KopoKopoWebhookView.as_view(),
        name='kopokopo-webhook',
    ),
    path(
        'api/token/',
        PhoneOrUsernameTokenObtainPairView.as_view(),
        name='token_obtain_pair',
    ),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Schema & docs
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # 2. Explicitly route the Dashboard APIView (Must be defined before router inclusion to avoid overlaps)
    path('api/dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('api/reports/financial/', FinancialReportsView.as_view(), name='financial-reports'),
    # 3. Include all router-registered ViewSet paths
    path('api/', include(router.urls)),
]