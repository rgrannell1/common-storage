"""Input validation schemas for CmstrClient — Pydantic models mirroring the server's Zod input schemas."""

from typing import Any

from pydantic import BaseModel, Field, field_validator


class GetEventsParams(BaseModel):
    """Validated parameters for GET /events/:topic."""

    topic: str = Field(min_length=1, max_length=128)
    start: int | None = Field(default=None, ge=0)
    size: int | None = Field(default=None, gt=0)
    filter: str | None = Field(default=None, min_length=1)
    ids: list[int] | None = None

    @field_validator("topic")
    @classmethod
    def topic_not_empty(cls, value: str) -> str:
        """Topic name must be 1-128 characters."""
        return value

    @field_validator("ids")
    @classmethod
    def ids_non_empty_and_positive(cls, value: list[int] | None) -> list[int] | None:
        """IDs list must be non-empty and all elements must be positive."""
        if value is not None:
            if len(value) == 0:
                raise ValueError("ids must not be empty")
            if any(entry_id <= 0 for entry_id in value):
                raise ValueError("ids must all be positive integers")
        return value


class GetEventParams(BaseModel):
    """Validated parameters for GET /events/:topic/:id."""

    topic: str = Field(min_length=1, max_length=128)
    id: int = Field(gt=0)


class PostEventParams(BaseModel):
    """Validated parameters for POST /events/:topic."""

    topic: str = Field(min_length=1, max_length=128)
    payload: Any
    idempotency_key: str | None = None


class PutEventParams(BaseModel):
    """Validated parameters for PUT /events/:topic/:id."""

    topic: str = Field(min_length=1, max_length=128)
    id: int = Field(gt=0)
    payload: Any
    idempotency_key: str | None = None


class GetObjectsParams(BaseModel):
    """Validated parameters for GET /objects/:topic."""

    topic: str = Field(min_length=1, max_length=128)
    filter: str | None = Field(default=None, min_length=1)


class GetObjectParams(BaseModel):
    """Validated parameters for GET /objects/:topic/:id."""

    topic: str = Field(min_length=1, max_length=128)
    id: str = Field(min_length=1)


class PutObjectParams(BaseModel):
    """Validated parameters for PUT /objects/:topic/:id."""

    topic: str = Field(min_length=1, max_length=128)
    id: str = Field(min_length=1)
    payload: Any
    idempotency_key: str | None = None


class DeleteObjectParams(BaseModel):
    """Validated parameters for DELETE /objects/:topic/:id."""

    topic: str = Field(min_length=1, max_length=128)
    id: str = Field(min_length=1)


class StreamEventsParams(BaseModel):
    """Validated parameters for GET /events/:topic NDJSON stream."""

    topic: str = Field(min_length=1, max_length=128)
    start: int | None = Field(default=None, ge=0)


class StreamObjectsParams(BaseModel):
    """Validated parameters for GET /objects/:topic NDJSON stream."""

    topic: str = Field(min_length=1, max_length=128)
    start: int | None = Field(default=None, ge=0)


class DiffBucket(BaseModel):
    """A single bucket in a diff request body."""

    start: int = Field(ge=0)
    end: int = Field(gt=0)
    hash: str = Field(min_length=64, max_length=64)


class PostDiffParams(BaseModel):
    """Validated parameters for POST /diff/:topic — works for both event and object topics."""

    topic: str = Field(min_length=1, max_length=128)
    root: str = Field(min_length=64, max_length=64)
    buckets: list[DiffBucket]
