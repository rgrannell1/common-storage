"""Response type models for CmstrClient — entry shapes, feed response, and config."""

from typing import Any

from pydantic import BaseModel, Field


class EventEntry(BaseModel):
    """A single entry in an event topic."""

    id: int
    created_at: int = Field(alias="createdAt")
    updated_at: int = Field(alias="updatedAt")
    payload: Any

    model_config = {"populate_by_name": True}


class ObjectEntry(BaseModel):
    """A single entry in an object topic."""

    id: str
    created_at: int = Field(alias="createdAt")
    updated_at: int = Field(alias="updatedAt")
    payload: Any  # None indicates a tombstone

    model_config = {"populate_by_name": True}


class TopicSummary(BaseModel):
    """Summary of a topic returned by GET /feed."""

    topic: str
    count: int
    last_updated: int = Field(alias="lastUpdated")

    model_config = {"populate_by_name": True}


class SubscriptionSummary(BaseModel):
    """Summary of an active server subscription returned by GET /feed."""

    source: str
    topic: str
    frequency: int
    created: int


class FeedResponse(BaseModel):
    """Response body for GET /feed."""

    topics: list[TopicSummary]
    subscriptions: list[SubscriptionSummary]


class EventsResponse(BaseModel):
    """Response body for GET /events/:topic."""

    entries: list[EventEntry]
    next: int | None


