import re

from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from .models import (
    Department,
    EmployeeProfile,
    LeaveRequest,
    Organization,
    PayrollRecord,
    PayrollRun,
)
from django.contrib.auth import get_user_model
from django.db import transaction

from users.phone_numbers import KenyanPhoneNumberField

User = get_user_model()


class KenyanKraPinField(serializers.CharField):
    def __init__(self, **kwargs):
        kwargs.setdefault('max_length', 11)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data).upper()
        if not re.fullmatch(r'[A-Z]\d{9}[A-Z]', value):
            raise serializers.ValidationError(
                'Enter a valid KRA PIN, for example A123456789B.'
            )
        return value


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source='employee_profile.user.get_full_name',
        read_only=True,
    )
    employee_id = serializers.CharField(
        source='employee_profile.employee_id',
        read_only=True,
    )
    department_name = serializers.CharField(
        source='employee_profile.department.name',
        read_only=True,
    )
    reviewed_by_name = serializers.CharField(
        source='reviewed_by.get_full_name',
        read_only=True,
        allow_null=True,
    )
    days_requested = serializers.IntegerField(read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            'id',
            'employee_name',
            'employee_id',
            'department_name',
            'leave_type',
            'start_date',
            'end_date',
            'days_requested',
            'reason',
            'status',
            'review_note',
            'reviewed_by_name',
            'reviewed_at',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'review_note',
            'reviewed_by_name',
            'reviewed_at',
            'created_at',
        ]

    def validate(self, attrs):
        start_date = attrs.get('start_date', self.instance.start_date if self.instance else None)
        end_date = attrs.get('end_date', self.instance.end_date if self.instance else None)
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({'end_date': 'End date must be on or after the start date.'})

        employee_profile = self.context.get('employee_profile')
        if employee_profile and start_date and end_date:
            overlapping_request = LeaveRequest.objects.filter(
                employee_profile=employee_profile,
                status__in=[LeaveRequest.Status.PENDING, LeaveRequest.Status.APPROVED],
                start_date__lte=end_date,
                end_date__gte=start_date,
            ).exists()
            if overlapping_request:
                raise serializers.ValidationError(
                    {'start_date': 'This request overlaps an existing pending or approved leave request.'}
                )
        return attrs


class EmployeeProfileSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    kra_pin = KenyanKraPinField(required=True, allow_blank=False)

    base_salary = serializers.DecimalField(max_digits=12, decimal_places=2)
    allowance = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    deductions = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    nssf = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    sha = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    kra = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    housing_levy = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    sacco_contribution = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    sacco_repayment = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    helb_monthly_amount = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        model = EmployeeProfile
        fields = [
            'employee_id',
            'kra_pin',
            'department',
            'department_name',
            'joining_date',
            'base_salary',
            'allowance',
            'deductions',
            'nssf',
            'sha',
            'kra',
            'housing_levy',
            'sacco_contribution',
            'sacco_repayment',
            'helb_monthly_amount',
            'tax_class',
            'bank_name',
            'bank_account',
        ]


class EmployeeOnboardingSerializer(serializers.ModelSerializer):
    phone_number = KenyanPhoneNumberField()
    payroll_profile = EmployeeProfileSerializer()
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    organization_kra_pin = serializers.CharField(
        source='organization.kra_pin',
        read_only=True,
    )

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
            'payroll_profile',
            'organization_name',
            'organization_kra_pin',
        ]
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data, organization=None):
        profile_data = validated_data.pop('payroll_profile')

        with transaction.atomic():
            password = validated_data.pop('password', None)
            user = User(**validated_data)
            if organization is not None:
                user.organization = organization
            elif self.context.get('request') and hasattr(self.context['request'].user, 'organization'):
                user.organization = self.context['request'].user.organization

            # If your user model uses custom Choice roles, map them here safely
            if hasattr(User, 'Role'):
                user.role = getattr(User.Role, 'EMPLOYEE', 'EMPLOYEE')

            if password:
                user.set_password(password)
            user.save()

            EmployeeProfile.objects.create(user=user, **profile_data)

        return user

    def update(self, instance, validated_data):
        payroll_data = validated_data.pop('payroll_profile', None)
        password = validated_data.pop('password', None)

        instance = super().update(instance, validated_data)
        if password is not None:
            instance.set_password(password)
            instance.save()

        if payroll_data:
            payroll_profile = getattr(instance, 'payroll_profile', None)
            if payroll_profile:
                EmployeeProfileSerializer().update(payroll_profile, payroll_data)

        return instance


class PayrollRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee_profile.user.get_full_name', read_only=True)
    employee_id = serializers.CharField(source='employee_profile.employee_id', read_only=True)
    department_name = serializers.CharField(source='employee_profile.department.name', read_only=True)
    payroll_run_name = serializers.CharField(source='payroll_run.name', read_only=True)
    payroll_start_date = serializers.DateField(source='payroll_run.start_date', read_only=True)
    organization_name = serializers.CharField(source='payroll_run.organization.name', read_only=True)
    organization_kra_pin = serializers.CharField(source='payroll_run.organization.kra_pin', read_only=True)

    class Meta:
        model = PayrollRecord
        fields = [
            'id',
            'payroll_run',
            'payroll_run_name',
            'payroll_start_date',
            'organization_name',
            'organization_kra_pin',
            'employee_profile',
            'employee_name',
            'employee_id',
            'department_name',

            # Base Earnings
            'basic_salary',
            'total_allowance',
            'gross_pay',

            # Kenyan Statutory Deductions
            'nssf_deduction',
            'sha_deduction',
            'housing_levy_deduction',
            'paye_tax',
            'helb_deduction',

            # Historical SACCO Records (No longer pointing directly to dynamic profile variables)
            'sacco_contribution_deduction',
            'sacco_repayment_deduction',

            # Aggregated Totals
            'total_deductions',
            'net_pay',

            # Status & Metadata
            'paid',
            'payment_date',
            'created_at',
        ]
        read_only_fields = [
            'basic_salary',
            'total_allowance',
            'gross_pay',
            'nssf_deduction',
            'sha_deduction',
            'housing_levy_deduction',
            'paye_tax',
            'helb_deduction',
            'sacco_contribution_deduction',
            'sacco_repayment_deduction',
            'total_deductions',
            'net_pay',
            'employee_name',
            'employee_id',
            'department_name',
            'payroll_run_name',
            'payroll_start_date',
            'organization_name',
            'organization_kra_pin',
            'created_at'
        ]


class PayrollRunSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    record_count = serializers.IntegerField(source='records.count', read_only=True)
    records = PayrollRecordSerializer(many=True, read_only=True)

    class Meta:
        model = PayrollRun
        fields = [
            'id',
            'name',
            'start_date',
            'end_date',
            'status',
            'created_by_name',
            'record_count',
            'records',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['status', 'created_by_name', 'record_count', 'records', 'created_at', 'updated_at']


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'code', 'manager']


class OrganizationSerializer(serializers.ModelSerializer):
    kra_pin = KenyanKraPinField(
        validators=[UniqueValidator(queryset=Organization.objects.all())],
    )
    theme_color = serializers.RegexField(
        regex=r'^#[0-9a-fA-F]{6}$',
        error_messages={'invalid': 'Theme color must be a 6-digit hex color.'},
    )

    class Meta:
        model = Organization
        fields = ['id', 'name', 'kra_pin', 'currency', 'theme_color']