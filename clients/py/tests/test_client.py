"""Integration tests for CmstrClient and AsyncCmstrClient against a live cmstr server.

Tests are skipped when CS_TEST_URL or CS_TEST_TOKEN are absent — set both to run
against a local or remote server.
"""

import os

import pytest

from cmstr import AsyncCmstrClient, CmstrClient, CmstrError
from cmstr.types import EventEntry, FeedResponse, ObjectEntry

TEST_URL = os.environ.get("CS_TEST_URL", "")
TEST_TOKEN = os.environ.get("CS_TEST_TOKEN", "")
TEST_TOPIC_EVENTS = os.environ.get("CS_TEST_TOPIC_EVENTS", "logs")
TEST_TOPIC_OBJECTS = os.environ.get("CS_TEST_TOPIC_OBJECTS", "notes")

HTTP_NOT_FOUND = 404

requires_server = pytest.mark.skipif(
    not TEST_URL or not TEST_TOKEN,
    reason="CS_TEST_URL and CS_TEST_TOKEN must be set",
)


# -- Sync client --


@requires_server
def test_get_feed_returns_feed_response():
    """Proves get_feed returns a valid FeedResponse with topics and subscriptions."""
    with CmstrClient(url=TEST_URL, token=TEST_TOKEN) as client:
        feed = client.get_feed()
    assert isinstance(feed, FeedResponse)
    assert isinstance(feed.topics, list)
    assert isinstance(feed.subscriptions, list)


@requires_server
def test_post_event_returns_event_entry():
    """Proves post_event appends an entry and returns a typed EventEntry."""
    with CmstrClient(url=TEST_URL, token=TEST_TOKEN) as client:
        entry = client.post_event(topic=TEST_TOPIC_EVENTS, payload={"test": True})
    assert isinstance(entry, EventEntry)
    assert entry.id > 0
    assert entry.payload == {"test": True}


@requires_server
def test_get_event_returns_written_entry():
    """Proves get_event retrieves the entry that was just posted."""
    with CmstrClient(url=TEST_URL, token=TEST_TOKEN) as client:
        written = client.post_event(topic=TEST_TOPIC_EVENTS, payload={"value": 42})
        fetched = client.get_event(topic=TEST_TOPIC_EVENTS, id=written.id)
    assert fetched.id == written.id
    assert fetched.payload == {"value": 42}


@requires_server
def test_get_events_returns_events_response():
    """Proves get_events returns a paginated list including the posted entry."""
    with CmstrClient(url=TEST_URL, token=TEST_TOKEN) as client:
        written = client.post_event(topic=TEST_TOPIC_EVENTS, payload={"marker": "list-test"})
        result = client.get_events(topic=TEST_TOPIC_EVENTS, size=100)
    ids = [entry.id for entry in result.entries]
    assert written.id in ids


@requires_server
def test_put_object_and_get_object_round_trip():
    """Proves put_object writes an entry and get_object retrieves it unchanged."""
    with CmstrClient(url=TEST_URL, token=TEST_TOKEN) as client:
        client.put_object(topic=TEST_TOPIC_OBJECTS, id="py-test-key", payload={"x": 1})
        fetched = client.get_object(topic=TEST_TOPIC_OBJECTS, id="py-test-key")
    assert isinstance(fetched, ObjectEntry)
    assert fetched.payload == {"x": 1}


@requires_server
def test_delete_object_writes_tombstone():
    """Proves delete_object returns an ObjectEntry with null payload (tombstone)."""
    with CmstrClient(url=TEST_URL, token=TEST_TOKEN) as client:
        client.put_object(topic=TEST_TOPIC_OBJECTS, id="py-delete-key", payload={"x": 1})
        tombstone = client.delete_object(topic=TEST_TOPIC_OBJECTS, id="py-delete-key")
    assert tombstone.payload is None


@requires_server
def test_cmstr_error_raised_on_unknown_topic():
    """Proves CmstrError is raised with status 404 for a non-existent topic."""
    with CmstrClient(url=TEST_URL, token=TEST_TOKEN) as client, pytest.raises(CmstrError) as exc_info:
        client.get_events(topic="does-not-exist-xyz")
    assert exc_info.value.status == HTTP_NOT_FOUND


# -- Async client --


@requires_server
async def test_async_get_feed_returns_feed_response():
    """Proves AsyncCmstrClient.get_feed returns a valid FeedResponse."""
    async with AsyncCmstrClient(url=TEST_URL, token=TEST_TOKEN) as client:
        feed = await client.get_feed()
    assert isinstance(feed, FeedResponse)


@requires_server
async def test_async_post_event_returns_event_entry():
    """Proves AsyncCmstrClient.post_event appends an entry and returns a typed EventEntry."""
    async with AsyncCmstrClient(url=TEST_URL, token=TEST_TOKEN) as client:
        entry = await client.post_event(topic=TEST_TOPIC_EVENTS, payload={"async": True})
    assert isinstance(entry, EventEntry)
    assert entry.id > 0


@requires_server
async def test_async_put_get_object_round_trip():
    """Proves AsyncCmstrClient put_object and get_object round-trip correctly."""
    async with AsyncCmstrClient(url=TEST_URL, token=TEST_TOKEN) as client:
        await client.put_object(topic=TEST_TOPIC_OBJECTS, id="py-async-key", payload={"y": 2})
        fetched = await client.get_object(topic=TEST_TOPIC_OBJECTS, id="py-async-key")
    assert fetched.payload == {"y": 2}


# -- Validation --

invalid_topic_cases = [
    pytest.param("", id="empty-topic"),
    pytest.param("x" * 129, id="topic-too-long"),
]


@pytest.mark.parametrize("topic", invalid_topic_cases)
def test_invalid_topic_raises_before_request(topic: str):
    """Proves Pydantic validation raises ValueError for invalid topic names before any HTTP request."""
    with pytest.raises(ValueError):
        CmstrClient(url="http://localhost", token="tok").get_events(topic=topic)
