import decimal
import uuid

from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


def create_existing_billing_accounts(apps, schema_editor):
    Organization = apps.get_model('payroll', 'Organization')
    OrganizationBillingAccount = apps.get_model('payroll', 'OrganizationBillingAccount')
    now = timezone.now()
    OrganizationBillingAccount.objects.using(schema_editor.connection.alias).bulk_create(
        [
            OrganizationBillingAccount(
                organization_id=organization_id,
                billing_started_at=now,
            )
            for organization_id in Organization.objects.using(
                schema_editor.connection.alias
            ).values_list('id', flat=True)
        ]
    )


class Migration(migrations.Migration):
    dependencies = [
        ('payroll', '0004_organization_currency_ksh'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrganizationBillingAccount',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('billing_started_at', models.DateTimeField(default=timezone.now)),
                (
                    'organization',
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='billing_account',
                        to='payroll.organization',
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name='MonthlyInvoice',
            fields=[
                (
                    'id',
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ('period_start', models.DateTimeField()),
                ('period_end', models.DateTimeField()),
                ('employee_count', models.PositiveIntegerField()),
                (
                    'price_per_employee',
                    models.DecimalField(
                        decimal_places=2,
                        default=decimal.Decimal('100.00'),
                        max_digits=10,
                    ),
                ),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    'status',
                    models.CharField(
                        choices=[
                            ('DUE', 'Due'),
                            ('PROCESSING', 'Payment processing'),
                            ('PAID', 'Paid'),
                            ('FAILED', 'Payment failed'),
                        ],
                        default='DUE',
                        max_length=15,
                    ),
                ),
                ('payment_request_id', models.CharField(blank=True, max_length=100)),
                ('transaction_reference', models.CharField(blank=True, max_length=100)),
                ('issued_at', models.DateTimeField(default=timezone.now)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                (
                    'organization',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='billing_invoices',
                        to='payroll.organization',
                    ),
                ),
            ],
            options={
                'ordering': ['-period_start'],
            },
        ),
        migrations.AddConstraint(
            model_name='monthlyinvoice',
            constraint=models.UniqueConstraint(
                fields=('organization', 'period_start'),
                name='unique_org_monthly_invoice_period',
            ),
        ),
        migrations.RunPython(create_existing_billing_accounts, migrations.RunPython.noop),
    ]
