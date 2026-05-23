"""Sync and async HTTP clients for the cmstr API."""

from collections.abc import AsyncGenerator, Generator
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import TypeAdapter

from .error import CmstrError
from .schemas import (
    DeleteObjectParams,
    GetEventParams,
    GetEventsParams,
    GetObjectParams,
    GetObjectsParams,
    PostEventParams,
    PutEventParams,
    PutObjectParams,
    StreamEventsParams,
    StreamObjectsParams,
    PostDiffParams,
)
from .types import (
    EventEntry,
    EventsResponse,
    FeedResponse,
    ObjectEntry,
)

_object_list = TypeAdapter(list[ObjectEntry])


def raise_for_status(response: httpx.Response) -> None:
    """Raise CmstrError if the response is not 2xx."""
    if response.is_error:
        try:
            body = response.json()
        except ValueError:
            body = response.text
        raise CmstrError(status=response.status_code, body=body)


def ids_param(ids: list[int]) -> str:
    """Serialise a list of integer IDs to the comma-separated query string format."""
    return ",".join(str(entry_id) for entry_id in ids)


def events_query(params: GetEventsParams) -> dict[str, str]:
    """Build the query string dict for GET /events/:topic."""
    query: dict[str, str] = {}
    if params.start is not None:
        query["start"] = str(params.start)
    if params.size is not None:
        query["size"] = str(params.size)
    if params.filter is not None:
        query["filter"] = params.filter
    if params.ids is not None:
        query["ids"] = ids_param(params.ids)
    return query


def objects_query(params: GetObjectsParams) -> dict[str, str]:
    """Build the query string dict for GET /objects/:topic."""
    query: dict[str, str] = {}
    if params.filter is not None:
        query["filter"] = params.filter
    return query


def write_headers(idempotency_key: str | None) -> dict[str, str]:
    """Build headers for write requests, including Idempotency-Key when provided."""
    headers: dict[str, str] = {}
    if idempotency_key is not None:
        headers["Idempotency-Key"] = idempotency_key
    return headers


class CmstrClient:
    """Synchronous cmstr HTTP client. Wraps httpx.Client."""

    def __init__(self, url: str, token: str) -> None:
        self.http = httpx.Client(
            base_url=url.rstrip("/"),
            headers={"Authorization": f"Bearer {token}"},
        )

    def get_feed(self) -> FeedResponse:
        """GET /feed — returns topic summaries and active subscriptions."""
        response = self.http.get("/feed")
        raise_for_status(response)
        return FeedResponse.model_validate(response.json())

    def get_events(
        self,
        *,
        topic: str,
        start: int | None = None,
        size: int | None = None,
        filter: str | None = None,
        ids: list[int] | None = None,
    ) -> EventsResponse:
        """GET /events/:topic — paginated or filtered event entries."""
        params = GetEventsParams(topic=topic, start=start, size=size, filter=filter, ids=ids)
        response = self.http.get(f"/events/{quote(params.topic, safe='')}", params=events_query(params))
        raise_for_status(response)
        return EventsResponse.model_validate(response.json())

    def get_event(self, *, topic: str, id: int) -> EventEntry:
        """GET /events/:topic/:id — a single event entry."""
        params = GetEventParams(topic=topic, id=id)
        response = self.http.get(f"/events/{quote(params.topic, safe='')}/{params.id}")
        raise_for_status(response)
        return EventEntry.model_validate(response.json())

    def post_event(self, *, topic: str, payload: Any, idempotency_key: str | None = None) -> EventEntry:
        """POST /events/:topic — append a new entry to an event topic."""
        params = PostEventParams(topic=topic, payload=payload, idempotency_key=idempotency_key)
        body = {"payload": params.payload}
        response = self.http.post(f"/events/{quote(params.topic, safe='')}", json=body, headers=write_headers(params.idempotency_key))
        raise_for_status(response)
        return EventEntry.model_validate(response.json())

    def put_event(self, *, topic: str, id: int, payload: Any, idempotency_key: str | None = None) -> EventEntry:
        """PUT /events/:topic/:id — upsert an event entry at a specific ID."""
        params = PutEventParams(topic=topic, id=id, payload=payload, idempotency_key=idempotency_key)
        body = {"payload": params.payload}
        response = self.http.put(f"/events/{quote(params.topic, safe='')}/{params.id}", json=body, headers=write_headers(params.idempotency_key))
        raise_for_status(response)
        return EventEntry.model_validate(response.json())

    def get_objects(self, *, topic: str, filter: str | None = None) -> list[ObjectEntry]:
        """GET /objects/:topic — all entries in an object topic."""
        params = GetObjectsParams(topic=topic, filter=filter)
        response = self.http.get(f"/objects/{quote(params.topic, safe='')}", params=objects_query(params))
        raise_for_status(response)
        return _object_list.validate_python(response.json())

    def get_object(self, *, topic: str, id: str) -> ObjectEntry:
        """GET /objects/:topic/:id — a single object entry."""
        params = GetObjectParams(topic=topic, id=id)
        response = self.http.get(f"/objects/{quote(params.topic, safe='')}/{quote(params.id, safe='')}")
        raise_for_status(response)
        return ObjectEntry.model_validate(response.json())

    def put_object(self, *, topic: str, id: str, payload: Any, idempotency_key: str | None = None) -> ObjectEntry:
        """PUT /objects/:topic/:id — upsert an object entry."""
        params = PutObjectParams(topic=topic, id=id, payload=payload, idempotency_key=idempotency_key)
        body = {"payload": params.payload}
        response = self.http.put(f"/objects/{quote(params.topic, safe='')}/{quote(params.id, safe='')}", json=body, headers=write_headers(params.idempotency_key))
        raise_for_status(response)
        return ObjectEntry.model_validate(response.json())

    def delete_object(self, *, topic: str, id: str) -> ObjectEntry:
        """DELETE /objects/:topic/:id — write a tombstone for an object entry."""
        params = DeleteObjectParams(topic=topic, id=id)
        response = self.http.delete(f"/objects/{quote(params.topic, safe='')}/{quote(params.id, safe='')}")
        raise_for_status(response)
        return ObjectEntry.model_validate(response.json())

    def stream_events(self, *, topic: str, start: int | None = None) -> Generator[EventEntry, None, None]:
        """GET /events/:topic as NDJSON — yields entries as they arrive; streams indefinitely until disconnected."""
        params = StreamEventsParams(topic=topic, start=start)
        query: dict[str, str] = {}
        if params.start is not None:
            query["start"] = str(params.start)
        with self.http.stream(
            "GET",
            f"/events/{quote(params.topic, safe='')}",
            params=query,
            headers={"Accept": "application/x-ndjson"},
        ) as response:
            raise_for_status(response)
            remainder = ""
            for chunk in response.iter_text():
                combined = remainder + chunk
                lines = combined.split("\n")
                remainder = lines.pop()
                for line in lines:
                    trimmed = line.strip()
                    if trimmed:
                        yield EventEntry.model_validate_json(trimmed)
            if remainder.strip():
                yield EventEntry.model_validate_json(remainder.strip())

    def stream_objects(self, *, topic: str, start: int | None = None) -> Generator[ObjectEntry, None, None]:
        """GET /objects/:topic as NDJSON — yields entries as they arrive; streams indefinitely until disconnected."""
        params = StreamObjectsParams(topic=topic, start=start)
        query: dict[str, str] = {}
        if params.start is not None:
            query["start"] = str(params.start)
        with self.http.stream(
            "GET",
            f"/objects/{quote(params.topic, safe='')}",
            params=query,
            headers={"Accept": "application/x-ndjson"},
        ) as response:
            raise_for_status(response)
            remainder = ""
            for chunk in response.iter_text():
                combined = remainder + chunk
                lines = combined.split("\n")
                remainder = lines.pop()
                for line in lines:
                    trimmed = line.strip()
                    if trimmed:
                        yield ObjectEntry.model_validate_json(trimmed)
            if remainder.strip():
                yield ObjectEntry.model_validate_json(remainder.strip())

    def post_diff(self, *, topic: str, root: str, buckets: list[dict]) -> dict | None:
        """POST /diff/:topic — returns diverging ranges, or None if in sync."""
        params = PostDiffParams(topic=topic, root=root, buckets=buckets)
        body = {"root": params.root, "buckets": [b.model_dump() for b in params.buckets]}
        response = self.http.post(f"/diff/{quote(params.topic, safe='')}", json=body)
        raise_for_status(response)
        return None if response.status_code == 204 else response.json()

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self.http.close()

    def __enter__(self) -> "CmstrClient":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


class AsyncCmstrClient:
    """Asynchronous cmstr HTTP client. Wraps httpx.AsyncClient."""

    def __init__(self, url: str, token: str) -> None:
        self.http = httpx.AsyncClient(
            base_url=url.rstrip("/"),
            headers={"Authorization": f"Bearer {token}"},
        )

    async def get_feed(self) -> FeedResponse:
        """GET /feed — returns topic summaries and active subscriptions."""
        response = await self.http.get("/feed")
        raise_for_status(response)
        return FeedResponse.model_validate(response.json())

    async def get_events(
        self,
        *,
        topic: str,
        start: int | None = None,
        size: int | None = None,
        filter: str | None = None,
        ids: list[int] | None = None,
    ) -> EventsResponse:
        """GET /events/:topic — paginated or filtered event entries."""
        params = GetEventsParams(topic=topic, start=start, size=size, filter=filter, ids=ids)
        response = await self.http.get(f"/events/{quote(params.topic, safe='')}", params=events_query(params))
        raise_for_status(response)
        return EventsResponse.model_validate(response.json())

    async def get_event(self, *, topic: str, id: int) -> EventEntry:
        """GET /events/:topic/:id — a single event entry."""
        params = GetEventParams(topic=topic, id=id)
        response = await self.http.get(f"/events/{quote(params.topic, safe='')}/{params.id}")
        raise_for_status(response)
        return EventEntry.model_validate(response.json())

    async def post_event(self, *, topic: str, payload: Any, idempotency_key: str | None = None) -> EventEntry:
        """POST /events/:topic — append a new entry to an event topic."""
        params = PostEventParams(topic=topic, payload=payload, idempotency_key=idempotency_key)
        body = {"payload": params.payload}
        response = await self.http.post(f"/events/{quote(params.topic, safe='')}", json=body, headers=write_headers(params.idempotency_key))
        raise_for_status(response)
        return EventEntry.model_validate(response.json())

    async def put_event(self, *, topic: str, id: int, payload: Any, idempotency_key: str | None = None) -> EventEntry:
        """PUT /events/:topic/:id — upsert an event entry at a specific ID."""
        params = PutEventParams(topic=topic, id=id, payload=payload, idempotency_key=idempotency_key)
        body = {"payload": params.payload}
        url = f"/events/{quote(params.topic, safe='')}/{params.id}"
        response = await self.http.put(url, json=body, headers=write_headers(params.idempotency_key))
        raise_for_status(response)
        return EventEntry.model_validate(response.json())

    async def get_objects(self, *, topic: str, filter: str | None = None) -> list[ObjectEntry]:
        """GET /objects/:topic — all entries in an object topic."""
        params = GetObjectsParams(topic=topic, filter=filter)
        response = await self.http.get(f"/objects/{quote(params.topic, safe='')}", params=objects_query(params))
        raise_for_status(response)
        return _object_list.validate_python(response.json())

    async def get_object(self, *, topic: str, id: str) -> ObjectEntry:
        """GET /objects/:topic/:id — a single object entry."""
        params = GetObjectParams(topic=topic, id=id)
        response = await self.http.get(f"/objects/{quote(params.topic, safe='')}/{quote(params.id, safe='')}")
        raise_for_status(response)
        return ObjectEntry.model_validate(response.json())

    async def put_object(self, *, topic: str, id: str, payload: Any, idempotency_key: str | None = None) -> ObjectEntry:
        """PUT /objects/:topic/:id — upsert an object entry."""
        params = PutObjectParams(topic=topic, id=id, payload=payload, idempotency_key=idempotency_key)
        body = {"payload": params.payload}
        url = f"/objects/{quote(params.topic, safe='')}/{quote(params.id, safe='')}"
        response = await self.http.put(url, json=body, headers=write_headers(params.idempotency_key))
        raise_for_status(response)
        return ObjectEntry.model_validate(response.json())

    async def delete_object(self, *, topic: str, id: str) -> ObjectEntry:
        """DELETE /objects/:topic/:id — write a tombstone for an object entry."""
        params = DeleteObjectParams(topic=topic, id=id)
        response = await self.http.delete(f"/objects/{quote(params.topic, safe='')}/{quote(params.id, safe='')}")
        raise_for_status(response)
        return ObjectEntry.model_validate(response.json())

    async def stream_events(self, *, topic: str, start: int | None = None) -> AsyncGenerator[EventEntry, None]:
        """GET /events/:topic as NDJSON — yields entries as they arrive; streams indefinitely until disconnected."""
        params = StreamEventsParams(topic=topic, start=start)
        query: dict[str, str] = {}
        if params.start is not None:
            query["start"] = str(params.start)
        async with self.http.stream(
            "GET",
            f"/events/{quote(params.topic, safe='')}",
            params=query,
            headers={"Accept": "application/x-ndjson"},
        ) as response:
            raise_for_status(response)
            remainder = ""
            async for chunk in response.aiter_text():
                combined = remainder + chunk
                lines = combined.split("\n")
                remainder = lines.pop()
                for line in lines:
                    trimmed = line.strip()
                    if trimmed:
                        yield EventEntry.model_validate_json(trimmed)
            if remainder.strip():
                yield EventEntry.model_validate_json(remainder.strip())

    async def stream_objects(self, *, topic: str, start: int | None = None) -> AsyncGenerator[ObjectEntry, None]:
        """GET /objects/:topic as NDJSON — yields entries as they arrive; streams indefinitely until disconnected."""
        params = StreamObjectsParams(topic=topic, start=start)
        query: dict[str, str] = {}
        if params.start is not None:
            query["start"] = str(params.start)
        async with self.http.stream(
            "GET",
            f"/objects/{quote(params.topic, safe='')}",
            params=query,
            headers={"Accept": "application/x-ndjson"},
        ) as response:
            raise_for_status(response)
            remainder = ""
            async for chunk in response.aiter_text():
                combined = remainder + chunk
                lines = combined.split("\n")
                remainder = lines.pop()
                for line in lines:
                    trimmed = line.strip()
                    if trimmed:
                        yield ObjectEntry.model_validate_json(trimmed)
            if remainder.strip():
                yield ObjectEntry.model_validate_json(remainder.strip())

    async def post_diff(self, *, topic: str, root: str, buckets: list[dict]) -> dict | None:
        """POST /diff/:topic — returns diverging ranges, or None if in sync."""
        params = PostDiffParams(topic=topic, root=root, buckets=buckets)
        body = {"root": params.root, "buckets": [b.model_dump() for b in params.buckets]}
        response = await self.http.post(f"/diff/{quote(params.topic, safe='')}", json=body)
        raise_for_status(response)
        return None if response.status_code == 204 else response.json()

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self.http.aclose()

    async def __aenter__(self) -> "AsyncCmstrClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()
