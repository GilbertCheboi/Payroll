from django.db import migrations, models


def add_bank_account_if_missing(apps, schema_editor):
    employee_profile = apps.get_model('payroll', 'EmployeeProfile')
    table_name = employee_profile._meta.db_table
    with schema_editor.connection.cursor() as cursor:
        existing_columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(
                cursor, table_name
            )
        }

    if 'bank_account' not in existing_columns:
        field = models.CharField(max_length=100, blank=True)
        field.set_attributes_from_name('bank_account')
        schema_editor.add_field(employee_profile, field)


class Migration(migrations.Migration):
    dependencies = [
        ('payroll', '0008_monthlyinvoice_price_per_employee'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    add_bank_account_if_missing,
                    migrations.RunPython.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='employeeprofile',
                    name='bank_account',
                    field=models.CharField(blank=True, max_length=100),
                ),
            ],
        ),
    ]
