from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('payroll', '0010_monthlyinvoice_email_sent_at'),
    ]

    operations = [
        migrations.RenameField(
            model_name='organization',
            old_name='tax_id',
            new_name='kra_pin',
        ),
        migrations.AlterField(
            model_name='organization',
            name='kra_pin',
            field=models.CharField(
                help_text="The organization's Kenya Revenue Authority PIN.",
                max_length=50,
                unique=True,
            ),
        ),
        migrations.AddField(
            model_name='employeeprofile',
            name='kra_pin',
            field=models.CharField(blank=True, default='', max_length=11),
        ),
    ]
