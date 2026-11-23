from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('payroll', '0005_organization_billing'),
    ]

    operations = [
        migrations.AddField(
            model_name='monthlyinvoice',
            name='payment_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
    ]
