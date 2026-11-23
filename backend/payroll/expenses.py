from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch, Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.http import content_disposition_header
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .billing import BILLING_TIME_ZONE
from .models import ExpenseClaim, ExpenseLine, ExpenseReimbursement, ExpenseReview
from .permissions import BillingAccessPermission
from .tenancy import organization_for


class LineSerializer(serializers.ModelSerializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    receipt = serializers.FileField(write_only=True)

    class Meta:
        model = ExpenseLine
        fields = ['id', 'category', 'amount', 'description', 'receipt', 'receipt_name', 'receipt_type']
        read_only_fields = ['receipt_name', 'receipt_type']

    def validate_receipt(self, upload):
        if upload.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('Select a receipt smaller than 5 MB.')
        header = upload.read(12)
        upload.seek(0)
        if header.startswith(b'%PDF-'):
            mime, suffix = 'application/pdf', 'pdf'
        elif header.startswith(b'\xff\xd8\xff'):
            mime, suffix = 'image/jpeg', 'jpg'
        elif header.startswith(b'\x89PNG\r\n\x1a\n'):
            mime, suffix = 'image/png', 'png'
        else:
            raise serializers.ValidationError('Attach a PDF, JPEG, or PNG receipt.')
        return {
            'receipt': upload.read(),
            'receipt_type': mime,
            'receipt_name': f'receipt.{suffix}',
        }

    def create(self, validated_data):
        receipt = validated_data.pop('receipt')
        return ExpenseLine.objects.create(**validated_data, **receipt)


class ReviewSerializer(serializers.ModelSerializer):
    decision = serializers.ChoiceField(choices=['approved', 'rejected', 'returned'])

    class Meta:
        model = ExpenseReview
        fields = ['decision', 'note', 'reviewer', 'recorded_at']
        read_only_fields = ['reviewer', 'recorded_at']

    def validate(self, attrs):
        if attrs['decision'] in ('rejected', 'returned') and not attrs.get('note'):
            raise serializers.ValidationError({'note': 'Explain why you are returning or rejecting the claim.'})
        return attrs


class ReimbursementSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseReimbursement
        fields = ['method', 'paid_on', 'reference', 'amount', 'accountant', 'recorded_at']
        read_only_fields = ['amount', 'accountant', 'recorded_at']

    def validate_paid_on(self, value):
        if not self.context['claim'].duty_date <= value <= timezone.localdate(timezone=BILLING_TIME_ZONE):
            raise serializers.ValidationError('Enter a payment date between the duty date and today.')
        return value


class ClaimSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    lines = LineSerializer(many=True, read_only=True)
    reviews = ReviewSerializer(many=True, read_only=True)
    reimbursement = ReimbursementSerializer(read_only=True)
    total = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseClaim
        fields = ['id', 'employee', 'employee_name', 'purpose', 'duty_date', 'currency', 'status', 'submitted_at',
                  'approved_amount', 'lines', 'reviews', 'reimbursement', 'total']
        read_only_fields = ['employee', 'currency', 'status', 'submitted_at', 'approved_amount']

    def validate_duty_date(self, value):
        if value > timezone.localdate(timezone=BILLING_TIME_ZONE):
            raise serializers.ValidationError('Choose today or an earlier duty date.')
        return value

    def get_employee_name(self, claim):
        return claim.employee.get_full_name() or claim.employee.username

    def get_total(self, claim):
        return f'{sum(line.amount for line in claim.lines.all()):.2f}'


class ExpenseClaimViewSet(viewsets.ModelViewSet):
    permission_classes = [BillingAccessPermission]
    serializer_class = ClaimSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def _visible_claims(self):
        user = self.request.user
        claims = ExpenseClaim.objects.filter(organization=organization_for(self.request))
        if user.role == 'ACCOUNTANT':
            return claims.filter(Q(employee=user) | ~Q(status=ExpenseClaim.Status.DRAFT))
        return claims.filter(employee=user)

    def get_queryset(self):
        return self._visible_claims().select_related('employee', 'reimbursement').prefetch_related(
            Prefetch('lines', queryset=ExpenseLine.objects.defer('receipt')), 'reviews',
        ).order_by('-created_at', '-pk')

    def perform_create(self, serializer):
        organization = organization_for(self.request)
        serializer.save(employee=self.request.user, organization=organization, currency=organization.currency)

    def _locked_claim(self, pk):
        return get_object_or_404(self._visible_claims().select_for_update(), pk=pk)

    def _owner_edit(self, claim):
        if claim.employee_id != self.request.user.pk:
            raise PermissionDenied('Only the employee who created the claim can edit it.')
        if claim.status not in (ExpenseClaim.Status.DRAFT, ExpenseClaim.Status.RETURNED):
            raise ValidationError({'detail': 'Only drafts and returned claims can be edited.'})

    def _review_access(self, claim):
        if self.request.user.role != 'ACCOUNTANT' or claim.employee_id == self.request.user.pk:
            raise PermissionDenied('An accountant must review or reimburse another employee’s claim.')

    def _claim_response(self, pk):
        return Response(self.get_serializer(self.get_queryset().get(pk=pk)).data)

    @transaction.atomic
    def partial_update(self, request, pk=None):
        claim = self._locked_claim(pk)
        self._owner_edit(claim)
        serializer = self.get_serializer(claim, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return self._claim_response(pk)

    @transaction.atomic
    def destroy(self, request, pk=None):
        claim = self._locked_claim(pk)
        if claim.employee_id != request.user.pk or claim.status != ExpenseClaim.Status.DRAFT:
            raise PermissionDenied('Only the employee’s draft can be deleted.')
        claim.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    @transaction.atomic
    def lines(self, request, pk=None):
        claim = self._locked_claim(pk)
        self._owner_edit(claim)
        if claim.lines.count() >= 30:
            raise ValidationError({'detail': 'A claim can contain up to 30 expense lines.'})
        serializer = LineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(claim=claim)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'lines/(?P<line_id>[^/.]+)')
    @transaction.atomic
    def remove_line(self, request, pk=None, line_id=None):
        claim = self._locked_claim(pk)
        self._owner_edit(claim)
        get_object_or_404(claim.lines.defer('receipt'), pk=line_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path=r'lines/(?P<line_id>[^/.]+)/receipt')
    def receipt(self, request, pk=None, line_id=None):
        claim = self.get_object()
        line = get_object_or_404(claim.lines.all(), pk=line_id)
        response = HttpResponse(bytes(line.receipt), content_type=line.receipt_type)
        response['Content-Disposition'] = content_disposition_header(True, line.receipt_name)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def submit(self, request, pk=None):
        claim = self._locked_claim(pk)
        self._owner_edit(claim)
        if claim.duty_date > timezone.localdate(timezone=BILLING_TIME_ZONE):
            raise ValidationError({'detail': 'Choose today or an earlier duty date before submitting.'})
        if not claim.lines.exists():
            raise ValidationError({'detail': 'Add at least one expense with a receipt.'})
        claim.status = ExpenseClaim.Status.SUBMITTED
        claim.submitted_at = timezone.now()
        claim.save(update_fields=['status', 'submitted_at'])
        return self._claim_response(pk)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def review(self, request, pk=None):
        claim = self._locked_claim(pk)
        self._review_access(claim)
        if claim.status != ExpenseClaim.Status.SUBMITTED:
            raise ValidationError({'detail': 'Only submitted claims can be reviewed.'})
        serializer = ReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.save(claim=claim, reviewer=request.user)
        claim.status = decision.decision
        if claim.status == ExpenseClaim.Status.APPROVED:
            claim.approved_amount = claim.lines.aggregate(total=Sum('amount'))['total']
        claim.save(update_fields=['status', 'approved_amount'])
        return self._claim_response(pk)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reimburse(self, request, pk=None):
        claim = self._locked_claim(pk)
        self._review_access(claim)
        if claim.status != ExpenseClaim.Status.APPROVED:
            raise ValidationError({'detail': 'Only an approved claim awaiting payment can be reimbursed.'})
        serializer = ReimbursementSerializer(data=request.data, context={'claim': claim})
        serializer.is_valid(raise_exception=True)
        serializer.save(claim=claim, accountant=request.user, amount=claim.approved_amount)
        claim.status = ExpenseClaim.Status.REIMBURSED
        claim.save(update_fields=['status'])
        return self._claim_response(pk)
