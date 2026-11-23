import os
from pathlib import Path
from datetime import timedelta

import environ
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

env = environ.Env(
    DEBUG=(bool, False),
)

env_file = BASE_DIR / ".env"
if not env_file.exists():
    env_file = PROJECT_ROOT / ".env"

environ.Env.read_env(env_file)

# =============================================================================
# Core
# =============================================================================

SECRET_KEY = env("SECRET_KEY")
DEBUG = env.bool("DEBUG", default=False)

ALLOWED_HOSTS = env.list(
    "ALLOWED_HOSTS",
    default=[
        "payroll.agrieldo.com",
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
    ],
)

# =============================================================================
# Applications
# =============================================================================

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "drf_spectacular",

    "users",
    "payroll",
]

AUTH_USER_MODEL = "users.User"

# =============================================================================
# Middleware
# =============================================================================

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"

WSGI_APPLICATION = "core.wsgi.application"
ASGI_APPLICATION = "core.asgi.application"

# =============================================================================
# Templates
# =============================================================================

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# =============================================================================
# Database
# =============================================================================

if not env("DATABASE_URL", default=None):
    raise ImproperlyConfigured(
        "DATABASE_URL is not set. Configure it in backend/.env"
    )

DATABASES = {
    "default": env.db("DATABASE_URL")
}

DATABASES["default"]["CONN_MAX_AGE"] = env.int(
    "CONN_MAX_AGE",
    default=60,
)

if not DEBUG:
    DATABASES["default"].setdefault("OPTIONS", {})
    DATABASES["default"]["OPTIONS"]["sslmode"] = env(
        "DB_SSLMODE",
        default="prefer",
    )

# =============================================================================
# Cache / Redis
# =============================================================================

REDIS_URL = env("REDIS_URL", default=None)

if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
        }
    }

    SESSION_ENGINE = "django.contrib.sessions.backends.cache"
    SESSION_CACHE_ALIAS = "default"

# =============================================================================
# REST Framework
# =============================================================================

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "users.authentication.PasswordResetScopedJWTAuthentication",
    ),

    "DEFAULT_PERMISSION_CLASSES": (
        "payroll.permissions.BillingAccessPermission",
    ),

    "DEFAULT_PARSER_CLASSES": (
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ),

    "DEFAULT_PAGINATION_CLASS":
        "rest_framework.pagination.PageNumberPagination",

    "PAGE_SIZE": 20,

    "DEFAULT_THROTTLE_RATES": {
        "password_reset": "5/hour",
        "password_reset_confirm": "10/hour",
        "password_reset_phone_request": "5/hour",
        "password_reset_phone_verify": "10/hour",
    },

    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",

    "DEFAULT_RENDERER_CLASSES": (
        (
            "rest_framework.renderers.JSONRenderer",
            "rest_framework.renderers.BrowsableAPIRenderer",
        )
        if DEBUG
        else (
            "rest_framework.renderers.JSONRenderer",
        )
    ),
}

# =============================================================================
# Email / password reset
# =============================================================================

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="smtp.zoho.com")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=False)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="info@agrieldo.com")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=15)
DEFAULT_FROM_EMAIL = env(
    "DEFAULT_FROM_EMAIL",
    default="Agrieldo Payroll <info@agrieldo.com>",
)
FRONTEND_URL = env(
    "FRONTEND_URL",
    default="https://payroll.agrieldo.com",
).rstrip("/")
SMS_GATEWAY_URL = env(
    "SMS_GATEWAY_URL",
    default="https://isms.celcomafrica.com/api/services/sendsms/",
)
SMS_API_KEY = env("SMS_API_KEY", default="")
SMS_PARTNER_ID = env("SMS_PARTNER_ID", default="")
SMS_SHORTCODE = env("SMS_SHORTCODE", default="")

# =============================================================================
# Billing / Kopo Kopo
# =============================================================================

KOPOKOPO_CLIENT_ID = env("KOPOKOPO_CLIENT_ID", default="")
KOPOKOPO_CLIENT_SECRET = env("KOPOKOPO_CLIENT_SECRET", default="")
KOPOKOPO_API_KEY = env("KOPOKOPO_API_KEY", default="")
KOPOKOPO_BASE_URL = env(
    "KOPOKOPO_BASE_URL",
    default="https://api.kopokopo.com",
).rstrip("/")
KOPOKOPO_TILL_NUMBER = env("KOPOKOPO_TILL_NUMBER", default="")
KOPOKOPO_CALLBACK_URL = env("KOPOKOPO_CALLBACK_URL", default="")

# =============================================================================
# API Schema (drf-spectacular)
# =============================================================================

SPECTACULAR_SETTINGS = {
    "TITLE": "Agrieldo Payroll API",
    "DESCRIPTION": "API for the Agrieldo payroll platform.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/",
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": False,
    "SWAGGER_UI_SETTINGS": {
        "persistAuthorization": True,
    },
}

# =============================================================================
# JWT
# =============================================================================

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# =============================================================================
# CORS
# =============================================================================

CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[
        "https://payroll.agrieldo.com",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
    ],
)

CORS_ALLOWED_ORIGIN_REGEXES = env.list(
    "CORS_ALLOWED_ORIGIN_REGEXES",
    default=[
        r"^http://localhost:\d+$",
        r"^http://127\.0\.0\.1:\d+$",
    ] if DEBUG else [],
)

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = list(default_headers) + [
    "x-requested-with",
]

CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

# =============================================================================
# CSRF
# =============================================================================

CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS",
    default=[
        "https://payroll.agrieldo.com",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
)

# =============================================================================
# Password Validation
# =============================================================================

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME":
        "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME":
        "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME":
        "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME":
        "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# =============================================================================
# Internationalization
# =============================================================================

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

# =============================================================================
# Static / Media
# =============================================================================

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

APPEND_SLASH = True

# =============================================================================
# Logging
# =============================================================================

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}

# =============================================================================
# Production Security
# =============================================================================

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = (
        "HTTP_X_FORWARDED_PROTO",
        "https",
    )

    USE_X_FORWARDED_HOST = True

    SECURE_SSL_REDIRECT = env.bool(
        "SECURE_SSL_REDIRECT",
        default=True,
    )

    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

    X_FRAME_OPTIONS = "DENY"

    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

    CSRF_COOKIE_HTTPONLY = True