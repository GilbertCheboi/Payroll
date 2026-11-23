# backend/users/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()

class UserAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'password', 'first_name', 'last_name', 'email', 'role']
        extra_kwargs = {
            'password': {'write_only': True}  # Prevents password hashes from leaking in GET requests
        }

    def create(self, validated_data):
        # Intercept the request context to identify the performing user's tenant organization
        request = self.context.get('request')
        
        # Intercept the password to compile it into an encrypted string safely
        password = validated_data.pop('password', None)
        
        instance = self.Meta.model(**validated_data)
        
        # Enforce multi-tenancy allocation
        if request and hasattr(request.user, 'organization'):
            instance.organization = request.user.organization
            
        if password is not None:
            instance.set_password(password)
            
        instance.save()
        return instance
