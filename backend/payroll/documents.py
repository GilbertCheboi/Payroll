from calendar import month_abbr
from collections import defaultdict
from io import BytesIO
from xml.sax.saxutils import escape

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework.renderers import BaseRenderer


class PDFRenderer(BaseRenderer):
    media_type = 'application/pdf'
    format = 'pdf'
    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # Successful downloads use HttpResponse. This renders errors for PDF-only clients.
        if isinstance(data, dict):
            return str(data.get('detail', 'Document unavailable.')).encode()
        return b''


def _document(title, details, rows, widths, filename, pagesize=A4):
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    items = [Paragraph(escape(title), styles['Title'])]
    items.extend(Paragraph(escape(str(line)), styles['Normal']) for line in details)
    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#174358')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#edf4f6')]),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    items.extend([Spacer(1, 16), table])
    SimpleDocTemplate(buffer, pagesize=pagesize, title=title).build(items)

    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['Cache-Control'] = 'private, no-store'
    return response


def payslip_document(record):
    run = record.payroll_run
    profile = record.employee_profile
    fields = (
        ('Basic salary', 'basic_salary'), ('Allowances', 'total_allowance'),
        ('Gross pay', 'gross_pay'), ('PAYE', 'paye_tax'), ('SHA', 'sha_deduction'),
        ('NSSF', 'nssf_deduction'), ('Housing levy', 'housing_levy_deduction'),
        ('HELB', 'helb_deduction'), ('SACCO contribution', 'sacco_contribution_deduction'),
        ('SACCO loan repayment', 'sacco_repayment_deduction'),
        ('Total deductions', 'total_deductions'), ('Net pay', 'net_pay'),
    )
    rows = [('Description', run.organization.currency)]
    rows.extend((label, f'{getattr(record, field):,.2f}') for label, field in fields)
    details = (
        run.organization.name,
        f'Employer KRA PIN: {run.organization.kra_pin}',
        f'Employee: {profile.user.get_full_name() or profile.user.username} ({profile.employee_id})',
        f'Department: {profile.department.name}',
        f'Payroll: {run.name} ({run.start_date} to {run.end_date})',
        f'Payslip reference: {record.pk}',
    )
    return _document('Payslip', details, rows, (280, 110), f'payslip-{record.pk}.pdf')


def p9_document(records, year):
    profile = records[0].employee_profile
    organization = records[0].payroll_run.organization
    monthly = defaultdict(list)
    for record in records:
        monthly[record.payroll_run.start_date.month].append(record)

    fields = (
        ('Basic pay', 'basic_salary'), ('Benefits', 'total_allowance'), ('Gross pay', 'gross_pay'),
        ('NSSF', 'nssf_deduction'), ('SHA', 'sha_deduction'), ('Housing levy', 'housing_levy_deduction'),
        ('PAYE', 'paye_tax'),
    )
    rows = [('Month', *(label for label, _ in fields[:-1]), 'Personal relief', 'PAYE')]
    totals = [0] * (len(fields) + 1)
    for month in range(1, 13):
        period = monthly[month]
        amounts = [sum(getattr(record, field) for record in period) for _, field in fields]
        amounts.insert(-1, 2400 if period else 0)
        totals = [total + amount for total, amount in zip(totals, amounts)]
        rows.append((month_abbr[month], *(f'{amount:,.2f}' for amount in amounts)))
    rows.append(('Annual total', *(f'{amount:,.2f}' for amount in totals)))
    details = (
        f'Year of income: {year} ({organization.currency})',
        f'Employer: {organization.name} · KRA PIN: {organization.kra_pin}',
        f'Employee: {profile.user.get_full_name() or profile.user.username} ({profile.employee_id})',
        f'Employee KRA PIN: {profile.kra_pin or "Not provided"}',
    )
    return _document('Tax Deduction Card (P9)', details, rows, (86,) + (73,) * 8,
                     f'p9-{year}.pdf', landscape(A4))
