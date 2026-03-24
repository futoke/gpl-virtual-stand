import json
from typing import Dict, Optional
from urllib import error, request


class ApiError(RuntimeError):
    pass


class StandApi:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def get(self, path: str) -> Dict:
        req = request.Request(f"{self.base_url}{path}", method="GET")
        return self._send(req)

    def post(self, path: str, payload: Optional[Dict] = None) -> Dict:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return self._send(req)

    def _send(self, req: request.Request) -> Dict:
        try:
            with request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            details = exc.read().decode("utf-8")
            raise ApiError(f"{req.method} {req.full_url} failed: {exc.code} {details}") from exc
        except error.URLError as exc:
            raise ApiError(f"Cannot reach API at {self.base_url}: {exc.reason}") from exc
