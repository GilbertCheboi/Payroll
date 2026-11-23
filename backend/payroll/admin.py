# backend/payroll/admin.py
from django.contrib import admin
from .models import Organization, Department, EmployeeProfile, PayrollRun, PayrollRecord

@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'kra_pin', 'created_by', 'created_at')
    search_fields = ('name', 'kra_pin', 'created_by__username')
    list_filter = ('created_at',)
    ordering = ('-created_at',)

    def save_model(self, request, obj, form, change):
        if not obj.created_by:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'organization')
    search_fields = ('name', 'organization__name')
    list_filter = ('organization',)
    ordering = ('organization', 'name')


@admin.register(EmployeeProfile)
class EmployeeProfileAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'get_organization', 'department', 'base_salary', 'joining_date')
    list_filter = ('user__organization', 'department', 'joining_date')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'employee_id')
    ordering = ('-joining_date',)

    @admin.display(ordering='user__organization__name', description='Organization')
    def get_organization(self, obj):
        return obj.user.organization if obj.user.organization else "Unassigned"


@admin.register(PayrollRun)
class PayrollRunAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'organization', 'status', 'start_date', 'end_date', 'created_by', 'created_at')
    list_filter = ('organization', 'status', 'created_at')
    search_fields = ('name', 'organization__name', 'created_by__username')
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('-created_at',)


@admin.register(PayrollRecord)
class PayrollRecordAdmin(admin.ModelAdmin):
    list_display = ('id', 'payroll_run', 'employee_profile', 'employee_id', 'gross_pay', 'net_pay', 'paid')
    list_filter = ('payroll_run', 'paid')
    search_fields = ('employee_profile__employee_id', 'employee_profile__user__username')
    ordering = ('-payroll_run__start_date', 'employee_profile__employee_id')

    def employee_id(self, obj):
        return obj.employee_profile.employee_id
