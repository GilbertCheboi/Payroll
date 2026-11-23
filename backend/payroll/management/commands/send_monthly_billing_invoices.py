import time

from django.core.management.base import BaseCommand, CommandError

from payroll.billing_emails import send_monthly_invoices


class Command(BaseCommand):
    help = "Email each organization's current monthly billing invoice as a PDF."

    def add_arguments(self, parser):
        parser.add_argument(
            "--loop",
            action="store_true",
            help="Repeat the check hourly so temporary email failures are retried.",
        )

    def handle(self, *args, **options):
        while True:
            sent, skipped, failed = send_monthly_invoices()
            self.stdout.write(
                f"Billing invoice email run complete: "
                f"{sent} sent, {skipped} skipped, {failed} failed."
            )
            if failed and not options["loop"]:
                raise CommandError(
                    f"{failed} invoice email(s) failed; see the log for details."
                )
            if not options["loop"]:
                return
            time.sleep(3600)
