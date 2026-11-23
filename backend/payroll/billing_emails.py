import logging
import smtplib
from datetime import timedelta
from io import BytesIO

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.mail import EmailMessage
from django.core.validators import validate_email
from django.db.models import Q
from django.utils import timezone
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from .billing import BILLING_TIME_ZONE, current_invoice
from .models import MonthlyInvoice, Organization


logger = logging.getLogger(__name__)


def _pdf_text(value):
    return str(value).encode("latin-1", "replace").decode("latin-1")


def _invoice_pdf(invoice):
    pdf_buffer = BytesIO()
    document = canvas.Canvas(pdf_buffer, pagesize=letter)
    _, page_height = letter
    left = 54
    y = page_height - 60

    document.setTitle(f"Invoice {invoice.pk}")
    document.setFont("Helvetica-Bold", 18)
    document.drawString(left, y, "Payroll subscription invoice")

    y -= 36
    document.setFont("Helvetica", 11)
    lines = (
        f"Invoice: {invoice.pk}",
        f"Organization: {invoice.organization.name}",
        f"KRA PIN: {invoice.organization.kra_pin}",
        (
            "Billing period: "
            f"{timezone.localtime(invoice.period_start, BILLING_TIME_ZONE):%d %b %Y} - "
            f"{timezone.localtime(invoice.period_end - timedelta(microseconds=1), BILLING_TIME_ZONE):%d %b %Y}"
        ),
        (
            "Due date: "
            f"{timezone.localtime(invoice.period_end - timedelta(days=1), BILLING_TIME_ZONE):%d %b %Y}"
        ),
        f"Employees billed: {invoice.employee_count}",
        f"Price per employee: KES {invoice.price_per_employee:,.2f}",
        f"Amount due: KES {invoice.amount:,.2f}",
        f"Status: {invoice.get_status_display()}",
    )
    for line in lines:
        for wrapped_line in simpleSplit(
            _pdf_text(line),
            "Helvetica",
            11,
            letter[0] - 2 * left,
        ):
            document.drawString(left, y, wrapped_line)
            y -= 22

    document.setFont("Helvetica", 9)
    document.drawString(
        left,
        max(y - 16, 40),
        _pdf_text("Thank you for using Agrieldo Payroll."),
    )
    document.save()
    return pdf_buffer.getvalue()


def _billing_recipients(organization):
    user_model = get_user_model()
    admin_users = user_model.objects.filter(
        is_active=True,
        role="ADMIN",
    ).filter(
        Q(organization=organization)
        | Q(organizations=organization)
        | Q(pk=organization.created_by_id)
    ).exclude(email="")

    recipients = set()
    for user in admin_users.only("email"):
        try:
            validate_email(user.email)
        except ValidationError:
            logger.warning(
                "Skipping invalid billing email for organization %s and user %s.",
                organization.pk,
                user.pk,
            )
            continue
        recipients.add(user.email)
    return sorted(recipients)


def email_invoice(invoice):
    if invoice.email_sent_at:
        return False

    recipients = _billing_recipients(invoice.organization)
    if not recipients:
        logger.warning(
            "No valid active admin email addresses for organization %s; "
            "invoice %s was not sent.",
            invoice.organization_id,
            invoice.pk,
        )
        return False

    period = timezone.localtime(
        invoice.period_start,
        BILLING_TIME_ZONE,
    ).strftime("%B %Y")
    message = EmailMessage(
        subject=f"{invoice.organization.name} billing invoice - {period}",
        body=(
            f"Hello,\n\n"
            f"Please find attached the {period} billing invoice for "
            f"{invoice.organization.name}.\n\n"
            "The PDF invoice is attached for download."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=recipients,
    )
    message.attach(
        f"invoice-{invoice.pk}.pdf",
        _invoice_pdf(invoice),
        "application/pdf",
    )
    if message.send(fail_silently=False) != 1:
        raise smtplib.SMTPException("The billing invoice email was not accepted.")

    invoice.email_sent_at = timezone.now()
    invoice.save(update_fields=["email_sent_at"])
    return True


def send_monthly_invoices(current_time=None):
    current_time = current_time or timezone.now()
    sent = 0
    skipped = 0
    failed = 0

    for organization in Organization.objects.all().iterator():
        invoice = current_invoice(organization, current_time)
        if invoice is None or invoice.email_sent_at:
            skipped += 1
            continue
        try:
            if email_invoice(invoice):
                sent += 1
            else:
                skipped += 1
        except (OSError, smtplib.SMTPException):
            failed += 1
            logger.exception(
                "Billing invoice email failed for organization %s, invoice %s.",
                organization.pk,
                invoice.pk,
            )

    return sent, skipped, failed
