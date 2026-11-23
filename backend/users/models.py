# backend/users/models.py (or matching custom user file)
from django.contrib.auth.models import AbstractUser
from django.db import models
from payroll.models import Organization # Import the organization model

class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Main Admin'
        HR = 'HR', 'HR Specialist'
        EMPLOYEE = 'EMPLOYEE', 'Standard Employee'
        ACCOUNTANT = 'ACCOUNTANT', 'Accountant'

    role = models.CharField(max_length=15, choices=Role.choices, default=Role.EMPLOYEE)
    phone_number = models.CharField(
        max_length=16,
        unique=True,
        null=True,
        blank=True,
    )
    
    # ADD THIS LINE TO CONNECT EVERY USER TO A COMPANY
    organization = models.ForeignKey(
        Organization, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name='users'
    )

    organizations = models.ManyToManyField(
        Organization,
        blank=True,
        related_name='members',
    )
