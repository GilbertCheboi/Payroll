import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('payroll', '0006_monthlyinvoice_payment_amount'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LeaveRequest',
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
                (
                    'leave_type',
                    models.CharField(
                        choices=[
                            ('ANNUAL', 'Annual'),
                            ('SICK', 'Sick'),
                            ('PERSONAL', 'Personal'),
                            ('MATERNITY', 'Maternity'),
                            ('PATERNITY', 'Paternity'),
                            ('UNPAID', 'Unpaid'),
                            ('OTHER', 'Other'),
                        ],
                        max_length=15,
                    ),
                ),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('reason', models.TextField(max_length=2000)),
                (
                    'status',
                    models.CharField(
                        choices=[
                            ('PENDING', 'Pending'),
                            ('APPROVED', 'Approved'),
                            ('REJECTED', 'Rejected'),
                        ],
                        default='PENDING',
                        max_length=10,
                    ),
                ),
                ('review_note', models.TextField(blank=True, max_length=2000)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'employee_profile',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='leave_requests',
                        to='payroll.employeeprofile',
                    ),
                ),
                (
                    'organization',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='leave_requests',
                        to='payroll.organization',
                    ),
                ),
                (
                    'reviewed_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='reviewed_leave_requests',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
