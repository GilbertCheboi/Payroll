from django.db import migrations, models
import django.db.models.deletion


def copy_current_organizations(apps, schema_editor):
    User = apps.get_model('users', 'User')
    for user in User.objects.exclude(organization__isnull=True).iterator():
        user.organizations.add(user.organization_id)


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='organizations',
            field=models.ManyToManyField(blank=True, related_name='members', to='payroll.organization'),
        ),
        migrations.RunPython(copy_current_organizations, migrations.RunPython.noop),
    ]