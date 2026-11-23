import json
import logging
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .billing import (
    MONTHLY_PRICE_PER_EMPLOYEE,
    active_employee_count,
    apply_payment_result,
    current_invoice,
    invoice_status,
    is_billing_overdue,
    outstanding_amount,
)
from .kopokopo import (
    KopoKopoError,
    initiate_payment,
    integration_configured,
    normalize_phone_number,
    payment_request_status,
    verify_webhook_signature,
)
from .models import MonthlyInvoice
from .permissions import BillingAdminPermission
from .tenancy import active_organization


logger = logging.getLogger(__name__)


class BillingProviderException(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = 'The payment provider could not complete the request.'
    default_code = 'payment_provider_error'


class BillingPaymentSerializer(serializers.Serializer):
    invoice_id = serializers.UUIDField()
    phone_number = serializers.CharField(max_length=30)

    def validate_phone_number(self, value):
        try:
            return normalize_phone_number(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error)) from error


def serialize_invoice(invoice, current_time=None):
    if invoice is None:
        return None
    current_time = current_time or timezone.now()
    return {
        'id': str(invoice.id),
        'period_start': invoice.period_start,
        'period_end': invoice.period_end,
        'employee_count': invoice.employee_count,
        'price_per_employee': str(invoice.price_per_employee),
        'amount': str(invoice.amount),
        'currency': 'KES',
        'status': invoice_status(invoice, current_time),
        'payment_in_progress': invoice.status == MonthlyInvoice.Status.PROCESSING,
        'due_at': invoice.period_end - timedelta(days=1),
        'grace_ends_at': invoice.period_end + timedelta(days=7) - timedelta(microseconds=1),
        'paid_at': invoice.paid_at,
        'transaction_reference': invoice.transaction_reference,
    }


class OrganizationBillingView(APIView):
    permission_classes = [BillingAdminPermission]

    def get(self, request):
        organization = active_organization(request)
        if not organization:
            raise NotFound('No active organization found.')

        current_time = timezone.now()
        invoice = current_invoice(organization, current_time)
        invoices = (
            organization.billing_invoices.filter(period_start__lte=invoice.period_start)
            if invoice
            else organization.billing_invoices.none()
        )
        billing_overdue = is_billing_overdue(organization, current_time)
        total_due = (
            outstanding_amount(
                organization,
                through_period=invoice.period_start,
                current_time=current_time,
            )
            if invoice
            else Decimal('0.00')
        )
        return Response(
            {
                'employee_count': active_employee_count(organization),
                'price_per_employee': str(MONTHLY_PRICE_PER_EMPLOYEE),
                'currency': 'KES',
                'current_invoice': serialize_invoice(invoice, current_time),
                'total_due': str(total_due),
                'invoices': [
                    serialize_invoice(item, current_time)
                    for item in invoices
                ],
                'payment_configured': integration_configured(),
                'grace_period_days': 7,
                'billing_overdue': billing_overdue,
            }
        )


class InitiateBillingPaymentView(APIView):
    permission_classes = [BillingAdminPermission]

    def post(self, request):
        serializer = BillingPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        organization = active_organization(request)
        invoice = MonthlyInvoice.objects.filter(
            id=serializer.validated_data['invoice_id'],
            organization=organization,
        ).first()
        if not invoice:
            raise NotFound('Invoice not found for this organization.')
        if invoice.status == MonthlyInvoice.Status.PROCESSING:
            raise ValidationError(
                {'detail': 'A payment request is already in progress. Check its status before retrying.'}
            )
        total_due = outstanding_amount(
            organization,
            through_period=invoice.period_start,
        )
        if total_due <= Decimal('0.00'):
            raise ValidationError({'detail': 'There is no amount due for this invoice.'})

        invoice.status = MonthlyInvoice.Status.PROCESSING
        invoice.payment_amount = total_due
        invoice.payment_request_id = ''
        invoice.save(update_fields=['status', 'payment_amount', 'payment_request_id'])
        try:
            request_id = initiate_payment(
                invoice,
                request.user,
                serializer.validated_data['phone_number'],
                amount=total_due,
            )
        except KopoKopoError as error:
            invoice.status = MonthlyInvoice.Status.FAILED
            invoice.save(update_fields=['status', 'payment_amount'])
            raise BillingProviderException(str(error)) from error

        invoice.payment_request_id = request_id
        invoice.save(update_fields=['payment_request_id'])
        return Response(
            {
                'detail': 'Payment request sent. Approve the M-Pesa prompt on your phone.',
                'invoice': serialize_invoice(invoice),
            },
            status=status.HTTP_202_ACCEPTED,
        )


class CheckBillingPaymentView(APIView):
    permission_classes = [BillingAdminPermission]

    def post(self, request, invoice_id):
        organization = active_organization(request)
        invoice = MonthlyInvoice.objects.filter(
            id=invoice_id,
            organization=organization,
        ).first()
        if not invoice:
            raise NotFound('Invoice not found for this organization.')
        if (
            invoice.status == MonthlyInvoice.Status.PROCESSING
            and invoice.payment_request_id
        ):
            try:
                attributes = payment_request_status(invoice.payment_request_id)
                apply_payment_result(invoice, attributes)
            except KopoKopoError as error:
                raise BillingProviderException(str(error)) from error
            except ValueError as error:
                logger.warning('Kopo Kopo payment status did not match its invoice.')
                raise BillingProviderException(str(error)) from error
        return Response({'invoice': serialize_invoice(invoice)})


class KopoKopoWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        signature = request.headers.get('X-KopoKopo-Signature', '')
        if not verify_webhook_signature(request.body, signature):
            return Response(
                {'detail': 'Invalid webhook signature.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError:
            return Response(
                {'detail': 'Invalid JSON payload.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(payload, dict):
            return Response(
                {'detail': 'Invalid JSON payload.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attributes = payload.get('data', {}).get('attributes', {})
        if not isinstance(attributes, dict):
            return Response(
                {'detail': 'Invalid payment event.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        metadata = attributes.get('metadata') or {}
        invoice = None
        reference = metadata.get('reference')
        if reference:
            invoice = MonthlyInvoice.objects.filter(pk=reference).first()
        if not invoice:
            request_id = payload.get('data', {}).get('id')
            if request_id:
                invoice = MonthlyInvoice.objects.filter(
                    payment_request_id=request_id,
                ).first()
        if not invoice:
            return Response(
                {'detail': 'No matching invoice was found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if invoice.status != MonthlyInvoice.Status.PROCESSING:
            return Response(
                {'detail': 'There is no active payment request for this invoice.'},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            apply_payment_result(invoice, attributes)
        except ValueError as error:
            logger.warning('Kopo Kopo webhook did not match its invoice.')
            return Response(
                {'detail': str(error)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({'received': True})
