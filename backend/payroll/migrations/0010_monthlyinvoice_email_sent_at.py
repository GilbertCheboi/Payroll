from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("payroll", "0009_employeeprofile_bank_account"),
    ]

    operations = [
        migrations.AddField(
            model_name="monthlyinvoice",
            name="email_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
