from rest_framework.exceptions import PermissionDenied

from .models import Organization


def active_organization(request):
    """Resolve the tenant selected by an admin or HR user."""
    user = request.user
    requested_id = request.headers.get('X-Organization-ID')
    if requested_id and user.role in ['ADMIN', 'HR']:
        organization = user.organizations.filter(pk=requested_id).first()
        if organization:
            return organization
        organization = Organization.objects.filter(pk=requested_id, created_by=user).first()
        if organization:
            return organization
    return user.organization or user.organizations.first()


def organization_for(request):
    organization = active_organization(request)
    if organization is None:
        raise PermissionDenied('An organization is required.')
    return organization
