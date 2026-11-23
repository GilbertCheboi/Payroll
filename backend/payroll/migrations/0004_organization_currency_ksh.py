from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payroll', '0003_organization_theme_color'),
    ]

    operations = [
        migrations.AlterField(
            model_name='organization',
            name='currency',
            field=models.CharField(
                default='Ksh',
                help_text='The operational base currency for payroll calculations.',
                max_length=10,
            ),
        ),
    ]
