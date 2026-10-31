"""S3-compatible object storage (MinIO in development, any S3 in production)."""

from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings


@lru_cache
def _client():
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url or None,
        aws_access_key_id=s.s3_access_key,
        aws_secret_access_key=s.s3_secret_key,
        region_name=s.s3_region,
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}, max_pool_connections=32),
    )


def reset_client() -> None:
    _client.cache_clear()


def ensure_bucket() -> None:
    bucket = get_settings().s3_bucket
    c = _client()
    try:
        c.head_bucket(Bucket=bucket)
    except ClientError:
        c.create_bucket(Bucket=bucket)


def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    _client().put_object(Bucket=get_settings().s3_bucket, Key=key, Body=data, ContentType=content_type)


def put_file(key: str, path: str, content_type: str = "application/octet-stream") -> None:
    _client().upload_file(path, get_settings().s3_bucket, key, ExtraArgs={"ContentType": content_type})


def get_bytes(key: str) -> bytes | None:
    try:
        obj = _client().get_object(Bucket=get_settings().s3_bucket, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
            return None
        raise
    return obj["Body"].read()


def download_file(key: str, path: str) -> None:
    _client().download_file(get_settings().s3_bucket, key, path)


def ping() -> None:
    _client().head_bucket(Bucket=get_settings().s3_bucket)


def total_size(prefix: str) -> tuple[int, int]:
    """(object_count, bytes) under a prefix."""
    count = size = 0
    for page in (
        _client().get_paginator("list_objects_v2").paginate(Bucket=get_settings().s3_bucket, Prefix=prefix)
    ):
        for obj in page.get("Contents", []):
            count += 1
            size += obj["Size"]
    return count, size
