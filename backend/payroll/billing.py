import calendar
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import EmployeeProfile, MonthlyInvoice, OrganizationBillingAccount


MONTHLY_PRICE_PER_EMPLOYEE = Decimal('200.00')
BILLING_GRACE_PERIOD = timedelta(days=7)
BILLING_TIME_ZONE = ZoneInfo('Africa/Nairobi')


def add_months(anchor, months):
    month_index = anchor.month - 1 + months
    year = anchor.year + month_index // 12
    month = month_index % 12 + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return anchor.replace(year=year, month=month, day=day)


def current_billing_period(anchor, current_time=None):
    current_time = current_time or timezone.now()
    months = (current_time.year - anchor.year) * 12 + current_time.month - anchor.month
    period_start = add_months(anchor, months)
    if period_start > current_time:
        months -= 1
        period_start = add_months(anchor, months)
    return period_start, add_months(anchor, months + 1)


def calendar_month_start(value):
    local_value = timezone.localtime(value, BILLING_TIME_ZONE)
    return local_value.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def latest_issued_period_start(current_time):
    local_time = timezone.localtime(current_time, BILLING_TIME_ZONE)
    month_start = calendar_month_start(local_time)
    if local_time.day == calendar.monthrange(local_time.year, local_time.month)[1]:
        return month_start
    return add_months(month_start, -1)


def invoice_overdue_at(invoice):
    return invoice.period_end + BILLING_GRACE_PERIOD


def active_employee_count(organization):
    return EmployeeProfile.objects.filter(
        department__organization=organization,
        user__is_active=True,
        user__role='EMPLOYEE',
    ).count()


def ensure_invoices_through(organization, current_time=None):
    current_time = current_time or timezone.now()
    account, _ = OrganizationBillingAccount.objects.get_or_create(
        organization=organization,
        defaults={'billing_started_at': organization.created_at},
    )
    if account.billing_started_at != organization.created_at:
        account.billing_started_at = organization.created_at
        account.save(update_fields=['billing_started_at'])

    first_period = calendar_month_start(organization.created_at)
    last_period = latest_issued_period_start(current_time)
    period_start = first_period
    while period_start <= last_period:
        period_end = add_months(period_start, 1)
        employee_count = active_employee_count(organization)
        amount = (MONTHLY_PRICE_PER_EMPLOYEE * employee_count).quantize(Decimal('0.01'))
        invoice = MonthlyInvoice.objects.filter(
            organization=organization,
            period_start__gte=period_start,
            period_start__lt=period_end,
        ).first()
        if invoice and invoice.period_start != period_start:
            invoice.period_start = period_start
            invoice.period_end = period_end
            invoice.save(update_fields=['period_start', 'period_end'])
        invoice, _ = MonthlyInvoice.objects.get_or_create(
            organization=organization,
            period_start=period_start,
            defaults={
                'period_end': period_end,
                'employee_count': employee_count,
                'price_per_employee': MONTHLY_PRICE_PER_EMPLOYEE,
                'amount': amount,
                'status': (
                    MonthlyInvoice.Status.PAID if amount == 0 else MonthlyInvoice.Status.DUE
                ),
                'paid_at': current_time if amount == 0 else None,
            },
        )
        if (
            invoice.status not in (
                MonthlyInvoice.Status.PAID,
                MonthlyInvoice.Status.PROCESSING,
            )
            and (
                invoice.amount != amount
                or invoice.employee_count != employee_count
                or invoice.price_per_employee != MONTHLY_PRICE_PER_EMPLOYEE
            )
        ):
            invoice.amount = amount
            invoice.employee_count = employee_count
            invoice.price_per_employee = MONTHLY_PRICE_PER_EMPLOYEE
            if invoice.status == MonthlyInvoice.Status.PAID and amount > 0:
                invoice.status = MonthlyInvoice.Status.DUE
                invoice.paid_at = None
            invoice.save(
                update_fields=[
                    'period_end',
                    'employee_count',
                    'price_per_employee',
                    'amount',
                    'status',
                    'paid_at',
                ]
            )
        period_start = add_months(period_start, 1)

    MonthlyInvoice.objects.filter(
        organization=organization,
        period_start__gt=last_period,
        status=MonthlyInvoice.Status.PROCESSING,
    ).update(
        status=MonthlyInvoice.Status.FAILED,
        payment_request_id='',
        payment_amount=None,
    )


def current_invoice(organization, current_time=None):
    current_time = current_time or timezone.now()
    ensure_invoices_through(organization, current_time)
    return MonthlyInvoice.objects.filter(
        organization=organization,
        period_start__lte=latest_issued_period_start(current_time),
    ).first()


def outstanding_invoices(organization, through_period=None, current_time=None):
    ensure_invoices_through(organization, current_time)
    invoices = MonthlyInvoice.objects.filter(
        organization=organization,
    ).exclude(status=MonthlyInvoice.Status.PAID)
    if through_period is not None:
        invoices = invoices.filter(period_start__lte=through_period)
    return invoices


def outstanding_amount(organization, through_period=None, current_time=None):
    return outstanding_invoices(
        organization,
        through_period=through_period,
        current_time=current_time,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')


def is_billing_overdue(organization, current_time=None):
    current_time = current_time or timezone.now()
    ensure_invoices_through(organization, current_time)
    return outstanding_invoices(
        organization,
        current_time=current_time,
    ).filter(
        period_end__lte=current_time - BILLING_GRACE_PERIOD,
    ).exists()


def invoice_status(invoice, current_time=None):
    if invoice.status == MonthlyInvoice.Status.PAID:
        return 'PAID'
    current_time = current_time or timezone.now()
    if current_time >= invoice_overdue_at(invoice):
        return 'OVERDUE'
    if invoice.status == MonthlyInvoice.Status.PROCESSING:
        return 'PROCESSING'
    if invoice.status == MonthlyInvoice.Status.FAILED:
        return 'FAILED'
    return 'DUE'


def apply_payment_result(invoice, payment_attributes):
    if invoice.status == MonthlyInvoice.Status.PAID:
        return invoice

    status = payment_attributes.get('status')
    if status == 'Failed':
        invoice.status = MonthlyInvoice.Status.FAILED
        invoice.save(update_fields=['status'])
        return invoice
    if status != 'Success':
        return invoice

    event = payment_attributes.get('event') or {}
    resource = event.get('resource') or {}
    try:
        amount = Decimal(str(resource.get('amount')))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise ValueError('Payment result is missing a valid amount.') from error

    pending_invoices = MonthlyInvoice.objects.filter(
        organization=invoice.organization,
        period_start__lte=invoice.period_start,
    ).exclude(status=MonthlyInvoice.Status.PAID).order_by('period_start')
    total_due = pending_invoices.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    expected_amount = invoice.payment_amount or invoice.amount

    if (
        amount != expected_amount
        or resource.get('currency') != 'KES'
        or resource.get('status') != 'Received'
    ):
        raise ValueError('Payment result does not match the total due amount.')

    remaining_payment = amount
    invoices_to_pay = []
    for pending_invoice in pending_invoices:
        if pending_invoice.amount > remaining_payment:
            break
        invoices_to_pay.append(pending_invoice)
        remaining_payment -= pending_invoice.amount
        if remaining_payment == 0:
            break
    if remaining_payment != 0 or amount > total_due:
        raise ValueError('Payment amount does not match complete outstanding invoices.')

    paid_at = timezone.now()
    transaction_reference = str(resource.get('reference') or '')
    with transaction.atomic():
        MonthlyInvoice.objects.filter(
            pk__in=[item.pk for item in invoices_to_pay],
        ).update(
            status=MonthlyInvoice.Status.PAID,
            paid_at=paid_at,
            transaction_reference=transaction_reference,
        )
        invoice.refresh_from_db()
    return invoice
