# backend/users/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import gettext_lazy as _
from .models import User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    # Setup structural columns displayed on the index grid list view page
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'organization', 'is_staff')
    
    # Enable filtering side panels
    list_filter = ('role', 'organization', 'is_staff', 'is_superuser', 'is_active')
    
    # Fields searchable from top bar query input
    search_fields = ('username', 'first_name', 'last_name', 'email', 'organization__name')
    ordering = ('username',)

    # Extends standard creation/edit fieldset cards to cleanly show role and tenant assignments
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'email')}),
        (_('Enterprise Placement'), {'fields': ('role', 'organization')}), # Added fields
        (_('Permissions'), {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
        }),
        (_('Important dates'), {'fields': ('last_login', 'date_joined')}),
    )
