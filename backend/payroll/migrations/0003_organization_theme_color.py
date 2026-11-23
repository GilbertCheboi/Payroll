from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payroll', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='theme_color',
            field=models.CharField(
                default='#10b981',
                help_text="The organization's primary theme color as a hex value.",
                max_length=7,
            ),
        ),
    ]