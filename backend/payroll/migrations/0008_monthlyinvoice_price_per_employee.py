from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('payroll', '0007_leaverequest'),
    ]

    operations = [
        migrations.AlterField(
            model_name='monthlyinvoice',
            name='price_per_employee',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('200.00'),
                max_digits=10,
            ),
        ),
    ]
