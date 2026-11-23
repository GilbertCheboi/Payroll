import csv
from collections.abc import Mapping
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import HttpResponse
from django.db.models import Q, Sum
from django.db.models.functions import ExtractMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from .documents import PDFRenderer, p9_document, payslip_document
from .models import (
    Department,
    EmployeeProfile,
    LeaveRequest,
    Organization,
    PayrollRecord,
    PayrollRun,
)
from .permissions import BillingAccessPermission
from .serializers import (
    DepartmentSerializer,
    EmployeeOnboardingSerializer,
    LeaveRequestSerializer,
    OrganizationSerializer,
    PayrollRecordSerializer,
    PayrollRunSerializer,
)
from .tenancy import active_organization

User = get_user_model()


class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveRequestSerializer
    permission_classes = [BillingAccessPermission]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        organization = active_organization(self.request)
        if not organization:
            return LeaveRequest.objects.none()

        queryset = LeaveRequest.objects.filter(
            organization=organization,
        ).select_related(
            'employee_profile__user',
            'employee_profile__department',
            'reviewed_by',
        )
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if self.request.user.role not in ('ADMIN', 'HR'):
            queryset = queryset.filter(employee_profile__user=self.request.user)
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.user.role == 'EMPLOYEE' and self.request.method == 'POST':
            context['employee_profile'] = EmployeeProfile.objects.filter(
                user=self.request.user,
                department__organization=active_organization(self.request),
            ).first()
        return context

    def create(self, request, *args, **kwargs):
        if request.user.role != 'EMPLOYEE':
            raise PermissionDenied('Only employees can submit leave requests.')
        if not active_organization(request):
            raise ValidationError(
                {'organization': 'Your account is not associated with an organization.'}
            )
        if not self.get_serializer_context().get('employee_profile'):
            raise ValidationError({'employee': 'An employee profile is required to submit a leave request.'})
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(
            organization=active_organization(self.request),
            employee_profile=self.get_serializer_context()['employee_profile'],
        )

    def _review_request(self, request, status_value):
        if request.user.role not in ('ADMIN', 'HR'):
            raise PermissionDenied('Only admins and HR users can review leave requests.')

        if not isinstance(request.data, Mapping):
            raise ValidationError({'detail': 'Expected a JSON object.'})
        review_note = request.data.get('review_note', '')
        if not isinstance(review_note, str) or len(review_note) > 2000:
            raise ValidationError({'review_note': 'Review note must be 2000 characters or fewer.'})

        with transaction.atomic():
            leave_request = (
                self.get_queryset()
                .select_for_update(of=('self',))
                .filter(pk=self.kwargs['pk'])
                .first()
            )
            if leave_request is None:
                raise NotFound()
            if leave_request.status != LeaveRequest.Status.PENDING:
                raise ValidationError({'status': 'Only pending requests can be reviewed.'})

            leave_request.status = status_value
            leave_request.review_note = review_note
            leave_request.reviewed_by = request.user
            leave_request.reviewed_at = timezone.now()
            leave_request.save(
                update_fields=[
                    'status',
                    'review_note',
                    'reviewed_by',
                    'reviewed_at',
                ]
            )

        return Response(self.get_serializer(leave_request).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._review_request(request, LeaveRequest.Status.APPROVED)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._review_request(request, LeaveRequest.Status.REJECTED)


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    permission_classes = [BillingAccessPermission]

    def check_write_access(self):
        if self.request.method not in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return
        if self.request.user.role not in ('ADMIN', 'HR'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only admins and HR users can manage departments.')

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.check_write_access()

    def get_queryset(self):
        organization = active_organization(self.request)
        if not organization:
            return Department.objects.none()
        return Department.objects.filter(organization=organization).order_by('name')

    def perform_create(self, serializer):
        serializer.save(organization=active_organization(self.request))


class EmployeeOnboardingViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeOnboardingSerializer
    permission_classes = [BillingAccessPermission]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if (request.user.role == 'ACCOUNTANT' and self.action != 'get_my_profile') or (
            request.method in ('POST', 'PUT', 'PATCH', 'DELETE') and request.user.role not in ('ADMIN', 'HR')
        ):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only admins and HR users can manage employees.')

    def get_queryset(self):
        organization = active_organization(self.request)
        if not organization:
            return User.objects.none()
        account_status = self.request.query_params.get('status', 'active')
        return User.objects.filter(
            role='EMPLOYEE',
            is_active=account_status != 'deactivated',
            payroll_profile__department__organization=organization,
        ).order_by('-date_joined')

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active'])

    def perform_create(self, serializer):
        organization = active_organization(self.request)
        department = serializer.validated_data.get('payroll_profile', {}).get('department')
        if department and department.organization_id != organization.id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'payroll_profile': {'department': 'Department must belong to the active organization.'}})
        serializer.save(organization=organization)

    def perform_update(self, serializer):
        organization = active_organization(self.request)
        profile_data = serializer.validated_data.get('payroll_profile', {})
        department = profile_data.get('department')
        if department and department.organization_id != organization.id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'payroll_profile': {'department': 'Department must belong to the active organization.'}})
        serializer.save()

    @action(detail=False, methods=['get'], url_path='me')
    def get_my_profile(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)


class PayrollRunViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollRunSerializer
    permission_classes = [BillingAccessPermission]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.user.role == 'ACCOUNTANT' or (
            request.method in ('POST', 'PUT', 'PATCH', 'DELETE') and request.user.role not in ('ADMIN', 'HR')
        ):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only admins and HR users can manage payroll runs.')

    def get_queryset(self):
        organization = active_organization(self.request)
        if not organization:
            return PayrollRun.objects.none()
        return PayrollRun.objects.filter(organization=organization).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(organization=active_organization(self.request), created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        payroll_run = self.get_object()
        if payroll_run.status != PayrollRun.Status.DRAFT:
            return Response(
                {'detail': 'Payroll run can only be processed from the Draft state.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employee_profiles = EmployeeProfile.objects.filter(department__organization=active_organization(request))
        for profile in employee_profiles:
            record, created = PayrollRecord.objects.get_or_create(
                payroll_run=payroll_run,
                employee_profile=profile,
            )
            record.save()

        payroll_run.status = PayrollRun.Status.PROCESSED
        payroll_run.save()
        serializer = self.get_serializer(payroll_run)
        return Response(serializer.data)


class PayrollRecordViewSet(viewsets.ModelViewSet):
    serializer_class = PayrollRecordSerializer
    permission_classes = [BillingAccessPermission]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.user.role == 'ACCOUNTANT' and request.method not in ('GET', 'HEAD', 'OPTIONS'):
            raise PermissionDenied('Accountants can only view their personal payroll records.')

    def get_queryset(self):
        user = self.request.user
        organization = active_organization(self.request)
        if not organization:
            return PayrollRecord.objects.none()

        queryset = PayrollRecord.objects.filter(
            payroll_run__organization=organization
        ).select_related(
            'payroll_run',
            'employee_profile',
            'employee_profile__user',
            'employee_profile__department',
        ).order_by('-payroll_run__start_date', 'employee_profile__employee_id')

        if user.role not in ('ADMIN', 'HR'):
            queryset = queryset.filter(employee_profile__user=user)

        return queryset

    def _personal_records(self):
        return self.get_queryset().filter(
            employee_profile__user=self.request.user,
            payroll_run__status__in=[PayrollRun.Status.PROCESSED, PayrollRun.Status.PAID],
        ).select_related('payroll_run__organization')

    @action(detail=False, methods=['get'], url_path='me')
    def get_my_records(self, request):
        if not active_organization(request):
            raise ValidationError({'detail': 'User is not associated with an organization.'})
        return Response(self.get_serializer(self._personal_records(), many=True).data)

    def _p9_records(self, request):
        try:
            year = int(request.query_params.get('year', ''))
            if not 1 <= year <= 9999:
                raise ValueError
        except ValueError:
            raise ValidationError({'detail': 'Provide a valid tax year.'})
        records = self._personal_records().filter(
            payroll_run__start_date__year=year,
        ).annotate(month_num=ExtractMonth('payroll_run__start_date')).order_by('month_num')
        return year, records

    @action(detail=False, methods=['get'], url_path='p9')
    def get_my_p9(self, request):
        _, records = self._p9_records(request)
        return Response(self.get_serializer(records, many=True).data)

    @action(detail=True, methods=['get'], url_path='payslip', renderer_classes=[JSONRenderer, PDFRenderer])
    def download_payslip(self, request, pk=None):
        return payslip_document(get_object_or_404(self._personal_records(), pk=pk))

    @action(detail=False, methods=['get'], url_path='p9/pdf', renderer_classes=[JSONRenderer, PDFRenderer])
    def download_p9(self, request):
        year, records = self._p9_records(request)
        records = list(records)
        if not records:
            raise NotFound('There are no processed payroll records for this year.')
        return p9_document(records, year)


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes = [BillingAccessPermission]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.user.role == 'ACCOUNTANT' and request.method not in ('GET', 'HEAD', 'OPTIONS'):
            raise PermissionDenied('Accountants cannot change organization settings.')

    def perform_create(self, serializer):
        organization = serializer.save(created_by=self.request.user)
        self.request.user.organizations.add(organization)

    def get_queryset(self):
        user = self.request.user
        if user.role in ['ADMIN', 'HR']:
            return Organization.objects.filter(
                Q(members=user) | Q(created_by=user)
            ).distinct()
        return Organization.objects.filter(pk=user.organization_id)


class DashboardSummaryView(APIView):
    permission_classes = [BillingAccessPermission]

    def get(self, request):
        user = request.user
        organization = active_organization(request)
        if not organization:
            return Response({'detail': 'No organization profile found.'}, status=400)

        current_role = request.query_params.get('view_as', user.role)

        if user.role in ('ADMIN', 'HR') and current_role in ('ADMIN', 'HR'):
            total_employees = EmployeeProfile.objects.filter(
                department__organization=organization,
            ).count()
            current_date = timezone.localdate()
            people_on_leave = LeaveRequest.objects.filter(
                organization=organization,
                status=LeaveRequest.Status.APPROVED,
                start_date__lte=current_date,
                end_date__gte=current_date,
            ).values('employee_profile_id').distinct().count()

            finalized_records = PayrollRecord.objects.filter(
                payroll_run__organization=organization,
                payroll_run__status__in=['PROCESSED', 'PAID'],
            )

            payroll_runs = PayrollRun.objects.filter(organization=organization)
            payroll_totals = finalized_records.aggregate(
                gross=Sum('gross_pay'),
                net_pay=Sum('net_pay'),
                deductions=Sum('total_deductions'),
            )
            paid_out = finalized_records.filter(paid=True).aggregate(total=Sum('net_pay'))['total'] or 0
            pending_cycles = payroll_runs.filter(status=PayrollRun.Status.DRAFT).count()

            return Response({
                'role': current_role.lower(),
                'metrics': {
                    'totalEmployees': total_employees,
                    'peopleOnLeave': people_on_leave,
                    'payrollRuns': payroll_runs.count(),
                    'monthlyGrossProcessing': float(payroll_totals['gross'] or 0),
                    'netPayReady': float(payroll_totals['net_pay'] or 0),
                    'paidOut': float(paid_out),
                    'totalDeductions': float(payroll_totals['deductions'] or 0),
                    'pendingCycles': pending_cycles,
                },
            })

        latest_record = PayrollRecord.objects.filter(
            employee_profile__user=user,
            payroll_run__status__in=['PROCESSED', 'PAID'],
        ).order_by('-payroll_run__start_date').first()

        leave_balance = getattr(getattr(user, 'payroll_profile', None), 'leave_balance', 0.0)

        return Response({
            'role': 'employee',
            'metrics': {
                'baseContractPay': float(latest_record.basic_salary) if latest_record else 0.0,
                'nextPayday': 'End of Month',
                'leaveBalance': float(leave_balance),
            },
        })


class FinancialReportsView(APIView):
    permission_classes = [BillingAccessPermission]

    def get(self, request):
        user = request.user
        organization = active_organization(request)
        if user.role not in ['ADMIN', 'HR']:
            return Response({'detail': 'Unauthorized clearance level.'}, status=403)

        payroll_run_id = request.query_params.get('payroll_run_id')
        report_type = request.query_params.get('type')
        target_filter = request.query_params.get('target')

        if not payroll_run_id or not report_type:
            return Response({'detail': 'Missing payroll_run_id or report type parameter.'}, status=400)

        records = PayrollRecord.objects.filter(
            payroll_run_id=payroll_run_id,
            payroll_run__organization=organization,
        ).select_related('employee_profile', 'employee_profile__user')

        report_data = []

        if report_type == 'bank':
            if target_filter:
                records = records.filter(employee_profile__bank_name__iexact=target_filter)

            for rec in records:
                if not getattr(rec.employee_profile, 'bank_name', None):
                    continue
                report_data.append({
                    'employee_id': rec.employee_profile.employee_id,
                    'name': f"{rec.employee_profile.user.first_name} {rec.employee_profile.user.last_name}",
                    'bank_name': rec.employee_profile.bank_name,
                    'bank_account': getattr(rec.employee_profile, 'bank_account', 'N/A'),
                    'amount': float(rec.net_pay),
                })

        elif report_type == 'sacco':
            records = records.filter(
                Q(sacco_contribution_deduction__gt=0) | Q(sacco_repayment_deduction__gt=0)
            )

            for rec in records:
                contrib = float(rec.sacco_contribution_deduction or 0)
                repay = float(rec.sacco_repayment_deduction or 0)
                total_sacco = contrib + repay

                report_data.append({
                    'employee_id': rec.employee_profile.employee_id,
                    'name': f"{rec.employee_profile.user.first_name} {rec.employee_profile.user.last_name}",
                    'sacco_contribution': contrib,
                    'sacco_repayment': repay,
                    'total_deduction': total_sacco,
                })

        if request.query_params.get('download') == 'csv':
            columns = {
                'bank': ('employee_id', 'name', 'bank_name', 'bank_account', 'amount'),
                'sacco': ('employee_id', 'name', 'department', 'contribution', 'repayment', 'total_sacco'),
            }
            if report_type not in columns:
                raise ValidationError({'detail': 'Choose a bank or SACCO report.'})
            response = HttpResponse(content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="{report_type}-report.csv"'
            response['Cache-Control'] = 'private, no-store'
            writer = csv.DictWriter(response, fieldnames=columns[report_type])
            writer.writeheader()
            for row in report_data:
                writer.writerow({
                    key: "'" + value if isinstance(value, str) and value.startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else value
                    for key, value in row.items()
                })
            return response

        return Response({
            'report_type': report_type,
            'target_filter': target_filter or 'ALL',
            'data': report_data,
        })
