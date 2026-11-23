from uuid import uuid4
from decimal import Decimal
import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone


class Organization(models.Model):
    """
    The root tenant universe. All departments, employees, and payroll
    profiles must link back to an instance of this model.
    """
    name = models.CharField(
        max_length=255,
        help_text="The official registered name of the business entity."
    )
    kra_pin = models.CharField(
        max_length=50,
        unique=True,
        help_text="The organization's Kenya Revenue Authority PIN."
    )
    currency = models.CharField(
        max_length=10,
        default='Ksh',
        help_text="The operational base currency for payroll calculations."
    )
    theme_color = models.CharField(
        max_length=7,
        default='#10b981',
        help_text="The organization's primary theme color as a hex value."
    )

    # The Owner Link - Null/Blank allows the admin dropdown to be left empty for auto-assignment
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='owned_organizations',
        help_text="The primary administrator/owner account responsible for this organization."
    )

    # Metadata timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Organization"
        verbose_name_plural = "Organizations"
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class OrganizationBillingAccount(models.Model):
    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name='billing_account',
    )
    billing_started_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"Billing account: {self.organization.name}"


class MonthlyInvoice(models.Model):
    class Status(models.TextChoices):
        DUE = 'DUE', 'Due'
        PROCESSING = 'PROCESSING', 'Payment processing'
        PAID = 'PAID', 'Paid'
        FAILED = 'FAILED', 'Payment failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='billing_invoices',
    )
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    employee_count = models.PositiveIntegerField()
    price_per_employee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('200.00'))
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.DUE)
    payment_request_id = models.CharField(max_length=100, blank=True)
    transaction_reference = models.CharField(max_length=100, blank=True)
    issued_at = models.DateTimeField(default=timezone.now)
    paid_at = models.DateTimeField(null=True, blank=True)
    email_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-period_start']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'period_start'],
                name='unique_org_monthly_invoice_period',
            ),
        ]

    def __str__(self):
        return f"{self.organization.name}: {self.period_start:%Y-%m}"


class Department(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='departments', null=True,
                                     blank=True)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10)
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_departments'
    )

    class Meta:
        unique_together = ('organization', 'code')

    def __str__(self):
        org_name = self.organization.name if self.organization else "Unassigned Organization"
        return f"{self.name} ({org_name})"


class EmployeeProfile(models.Model):
    class TaxType(models.TextChoices):
        STANDARD = 'STANDARD', 'Standard PAYE'
        EXEMPT = 'EXEMPT', 'Tax Exempt'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payroll_profile'
    )
    employee_id = models.CharField(max_length=20, unique=True)
    kra_pin = models.CharField(max_length=11, blank=True, default='')
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name='employees')
    joining_date = models.DateField()

    # Financial Elements
    base_salary = models.DecimalField(max_digits=12, decimal_places=2)
    allowance = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True)

    # Profile baselines
    nssf = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True,
                               help_text='NSSF contribution amount')
    sha = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True,
                              help_text='SHA contribution amount')
    kra = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True, help_text='KRA tax amount')
    housing_levy = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True,
                                       help_text='Housing levy amount')
    sacco_contribution = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True,
                                             help_text='Sacco contribution amount')
    sacco_repayment = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True,
                                          help_text='Sacco repayment amount')
    helb_monthly_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True,
                                              help_text='HELB repayment amount')
    tax_class = models.CharField(max_length=15, choices=TaxType.choices, default=TaxType.STANDARD)

    # Bank Routing Data
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return f"Profile: {self.user.username} ({self.employee_id})"


class LeaveRequest(models.Model):
    class LeaveType(models.TextChoices):
        ANNUAL = 'ANNUAL', 'Annual'
        SICK = 'SICK', 'Sick'
        PERSONAL = 'PERSONAL', 'Personal'
        MATERNITY = 'MATERNITY', 'Maternity'
        PATERNITY = 'PATERNITY', 'Paternity'
        UNPAID = 'UNPAID', 'Unpaid'
        OTHER = 'OTHER', 'Other'

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='leave_requests',
    )
    employee_profile = models.ForeignKey(
        EmployeeProfile,
        on_delete=models.CASCADE,
        related_name='leave_requests',
    )
    leave_type = models.CharField(max_length=15, choices=LeaveType.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField(max_length=2000)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    review_note = models.TextField(max_length=2000, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_leave_requests',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def days_requested(self):
        return (self.end_date - self.start_date).days + 1

    def __str__(self):
        return f"{self.employee_profile.employee_id}: {self.leave_type} leave ({self.start_date} to {self.end_date})"


class PayrollRun(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        PROCESSED = 'PROCESSED', 'Processed'
        PAID = 'PAID', 'Paid'

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='payroll_runs'
    )
    name = models.CharField(max_length=200)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_payroll_runs'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Payroll Run: {self.name} ({self.organization.name})"


class PayrollRecord(models.Model):
    payroll_run = models.ForeignKey(
        'PayrollRun',
        on_delete=models.CASCADE,
        related_name='records'
    )
    employee_profile = models.ForeignKey(
        'EmployeeProfile',
        on_delete=models.PROTECT,
        related_name='payroll_records'
    )

    # --- Earnings ---
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_allowance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    gross_pay = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # --- Kenyan Statutory Deductions Breakdown ---
    nssf_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    sha_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    housing_levy_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    paye_tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    helb_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # --- Voluntary / SACCO Deductions ---
    sacco_contribution_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    sacco_repayment_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # --- Summary Blocks ---
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # --- Status & Metadata ---
    paid = models.BooleanField(default=False)
    payment_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('payroll_run', 'employee_profile')
        ordering = ['-payroll_run__start_date', 'employee_profile__employee_id']

    def __str__(self):
        return f"{self.employee_profile.employee_id} – {self.payroll_run.name}"

    def calculate_kenyan_payroll(self):
        """
        Executes the exact statutory calculations for Kenya.
        Applies SHA & Housing Levy tax reliefs directly to the calculated PAYE.
        Also factors in voluntary SACCO deductions.
        """
        # Ensure we are working with clean Decimal types
        gross = Decimal(str(self.basic_salary + self.total_allowance))
        self.gross_pay = gross

        if gross <= 0:
            self.nssf_deduction = Decimal('0.00')
            self.sha_deduction = Decimal('0.00')
            self.housing_levy_deduction = Decimal('0.00')
            self.paye_tax = Decimal('0.00')
            self.helb_deduction = Decimal('0.00')
            self.sacco_contribution_deduction = Decimal('0.00')
            self.sacco_repayment_deduction = Decimal('0.00')
            self.total_deductions = Decimal('0.00')
            self.net_pay = Decimal('0.00')
            return

        # ==========================================
        # 1. NSSF Calculation (Phased 2026 Rates)
        # ==========================================
        # Tier I: 6% up to Lower Earnings Limit of Ksh 9,000 (Max 540)
        # Tier II: 6% up to Upper Earnings Limit of Ksh 108,000 (Max 5,940)
        if gross <= Decimal('9000.00'):
            nssf = gross * Decimal('0.06')
        elif gross <= Decimal('108000.00'):
            nssf = Decimal('540.00') + ((gross - Decimal('9000.00')) * Decimal('0.06'))
        else:
            nssf = Decimal('6480.00')
        self.nssf_deduction = nssf.quantize(Decimal('0.01'))

        # ==========================================
        # 2. SHA (SHIF) Calculation (2.75%, Minimum Ksh 300)
        # ==========================================
        sha = gross * Decimal('0.0275')
        if sha < Decimal('300.00'):
            sha = Decimal('300.00')
        self.sha_deduction = sha.quantize(Decimal('0.01'))

        # ==========================================
        # 3. Affordable Housing Levy (1.5% of Gross)
        # ==========================================
        self.housing_levy_deduction = (gross * Decimal('0.015')).quantize(Decimal('0.01'))

        # ==========================================
        # 4. PAYE Tax Calculation
        # ==========================================
        taxable_pay = max(Decimal('0.00'), gross - self.nssf_deduction)
        raw_tax = Decimal('0.00')
        remaining = taxable_pay

        # Band 1: 10% on first 24,000
        if remaining > Decimal('24000.00'):
            raw_tax += Decimal('24000.00') * Decimal('0.10')
            remaining -= Decimal('24000.00')
        else:
            raw_tax += remaining * Decimal('0.10')
            remaining = Decimal('0.00')

        # Band 2: 25% on next 8,333
        if remaining > Decimal('8333.00'):
            raw_tax += Decimal('8333.00') * Decimal('0.25')
            remaining -= Decimal('8333.00')
        else:
            raw_tax += remaining * Decimal('0.25')
            remaining = Decimal('0.00')

        # Band 3: 30% on next 467,667
        if remaining > Decimal('467667.00'):
            raw_tax += Decimal('467667.00') * Decimal('0.30')
            remaining -= Decimal('467667.00')
        else:
            raw_tax += remaining * Decimal('0.30')
            remaining = Decimal('0.00')

        # Band 4: 32.5% on next 300,000
        if remaining > Decimal('300000.00'):
            raw_tax += Decimal('300000.00') * Decimal('0.325')
            remaining -= Decimal('300000.00')
        else:
            raw_tax += remaining * Decimal('0.325')
            remaining = Decimal('0.00')

        # Band 5: 35% on anything exceeding 800,000
        if remaining > Decimal('0.00'):
            raw_tax += remaining * Decimal('0.35')

        # Step B: Apply Standard Reliefs & Statutory Deductions Relief (15%)
        personal_relief = Decimal('2400.00')
        sha_relief = self.sha_deduction * Decimal('0.15')
        housing_levy_relief = self.housing_levy_deduction * Decimal('0.15')

        total_reliefs = personal_relief + sha_relief + housing_levy_relief

        paye = max(Decimal('0.00'), raw_tax - total_reliefs)
        self.paye_tax = paye.quantize(Decimal('0.01'))

        # ==========================================
        # 5. HELB Repayments (Calculated dynamically, e.g., 2% of basic or flat based on profile)
        # ==========================================
        if hasattr(self.employee_profile, 'helb_monthly_amount') and self.employee_profile.helb_monthly_amount:
            self.helb_deduction = Decimal(str(self.employee_profile.helb_monthly_amount))
        else:
            self.helb_deduction = Decimal('0.00')

        # ==========================================
        # 6. Voluntary SACCO Deductions (READ ONLY FROM PROFILE)
        # ==========================================
        # This keeps your SACCO records completely dynamic based on your Employee Profile inputs
        self.sacco_contribution_deduction = Decimal(str(getattr(self.employee_profile, 'sacco_contribution', '0.00')))
        self.sacco_repayment_deduction = Decimal(str(getattr(self.employee_profile, 'sacco_repayment', '0.00')))

        # ==========================================
        # 7. Aggregating Grand Totals
        # ==========================================
        self.total_deductions = (
                self.nssf_deduction +
                self.sha_deduction +
                self.housing_levy_deduction +
                self.paye_tax +
                self.helb_deduction +
                self.sacco_contribution_deduction +  # Dynamically loaded SACCO Contribution
                self.sacco_repayment_deduction  # Dynamically loaded SACCO Repayment
        ).quantize(Decimal('0.01'))

        self.net_pay = (self.gross_pay - self.total_deductions).quantize(Decimal('0.01'))

    def save(self, *args, **kwargs):
        """Overrides save to auto-populate profile baseline values and run calculations."""
        if self.employee_profile:
            # Copy base salary from employee profile if not explicitly populated
            if not self.basic_salary or self.basic_salary == Decimal('0.00'):
                self.basic_salary = getattr(self.employee_profile, 'base_salary', Decimal('0.00'))

            # Copy allowance from employee profile if not explicitly populated
            if not self.total_allowance or self.total_allowance == Decimal('0.00'):
                self.total_allowance = getattr(self.employee_profile, 'allowance', Decimal('0.00'))

        # Run calculations using baseline values
        self.calculate_kenyan_payroll()
        super().save(*args, **kwargs)

class WorkSite(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    name = models.CharField(max_length=150)
    latitude = models.FloatField()
    longitude = models.FloatField()
    radius_metres = models.PositiveIntegerField(default=100)
    time_zone = models.CharField(max_length=64, default='Africa/Nairobi')
    qr_token = models.UUIDField(default=uuid4, unique=True, editable=False)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class AttendanceShift(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    employee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    check_in_site = models.ForeignKey(WorkSite, on_delete=models.PROTECT, related_name='+')
    check_in_at = models.DateTimeField()
    check_in_request = models.UUIDField()
    check_out_site = models.ForeignKey(WorkSite, on_delete=models.PROTECT, related_name='+', null=True)
    check_out_at = models.DateTimeField(null=True)
    check_out_request = models.UUIDField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['organization', 'employee'], condition=models.Q(check_out_at__isnull=True),
                                    name='one_open_attendance_shift'),
            models.UniqueConstraint(fields=['organization', 'employee', 'check_in_request'],
                                    name='unique_attendance_check_in'),
            models.UniqueConstraint(fields=['organization', 'employee', 'check_out_request'],
                                    name='unique_attendance_check_out'),
        ]


class ExpenseClaim(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SUBMITTED = 'submitted', 'Submitted'
        RETURNED = 'returned', 'Returned for correction'
        REJECTED = 'rejected', 'Rejected'
        APPROVED = 'approved', 'Approved'
        REIMBURSED = 'reimbursed', 'Reimbursed'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    employee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    purpose = models.CharField(max_length=250)
    duty_date = models.DateField()
    currency = models.CharField(max_length=10)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    submitted_at = models.DateTimeField(null=True)
    approved_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ExpenseLine(models.Model):
    class Category(models.TextChoices):
        TRANSPORT = 'transport', 'Transport'
        LUNCH = 'lunch', 'Lunch'
        OTHER = 'other', 'Other'

    claim = models.ForeignKey(ExpenseClaim, on_delete=models.CASCADE, related_name='lines')
    category = models.CharField(max_length=16, choices=Category.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=200, blank=True)
    receipt_name = models.CharField(max_length=180)
    receipt_type = models.CharField(max_length=32)
    receipt = models.BinaryField(editable=False)

    class Meta:
        ordering = ['pk']


class ExpenseReview(models.Model):
    claim = models.ForeignKey(ExpenseClaim, on_delete=models.CASCADE, related_name='reviews')
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    decision = models.CharField(max_length=16, choices=ExpenseClaim.Status.choices)
    note = models.CharField(max_length=500, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-pk']


class ExpenseReimbursement(models.Model):
    class Method(models.TextChoices):
        MPESA = 'mpesa', 'M-Pesa'
        BANK = 'bank', 'Bank transfer'
        CASH = 'cash', 'Cash'

    claim = models.OneToOneField(ExpenseClaim, on_delete=models.CASCADE, related_name='reimbursement')
    accountant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    method = models.CharField(max_length=12, choices=Method.choices)
    paid_on = models.DateField()
    reference = models.CharField(max_length=100, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
