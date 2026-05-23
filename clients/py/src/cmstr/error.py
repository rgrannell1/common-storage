"""CmstrError — raised on non-2xx HTTP responses from the cmstr API."""


class CmstrError(Exception):
    """HTTP error from the cmstr API, carrying the status code and parsed body."""

    status: int
    body: object

    def __init__(self, status: int, body: object) -> None:
        self.status = status
        self.body = body
        super().__init__(f"cmstr API error {status}: {body}")

    def __reduce__(self) -> tuple:
        return (self.__class__, (self.status, self.body))
