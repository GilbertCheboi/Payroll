from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission, SAFE_METHODS

from .billing import is_billing_overdue
from .tenancy import active_organization


class BillingAccessPermission(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        organization = active_organization(request)
        if organization and is_billing_overdue(organization):
            billing_prefix = '/api/billing'
            path = request.path_info or ''
            is_login_profile_lookup = (
                request.method == 'GET'
                and path.rstrip('/') == '/api/accounts/me'
            )
            is_password_reset_update = (
                request.method == 'PATCH'
                and path.rstrip('/') == '/api/accounts/me'
                and request.auth
                and request.auth.get('password_reset_only')
                and set(request.data) == {'password'}
            )
            if (
                not path.startswith(billing_prefix)
                and not is_login_profile_lookup
                and not is_password_reset_update
            ):
                raise PermissionDenied(
                    'This organization is read-only because its subscription invoice is overdue. '
                    'An administrator can manage billing and make a payment.'
                )

        if request.method in SAFE_METHODS:
            return True
        return True


class BillingAdminPermission(BasePermission):
    message = 'Only organization administrators can manage billing.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'ADMIN'
        )
