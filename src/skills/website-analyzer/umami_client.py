#!/usr/bin/env python3
"""
Umami Analytics API client — fetches traffic data for the website analyzer.
Supports both username/password login and direct API token.
"""
import requests
from datetime import datetime, timedelta


class UmamiClient:
    def __init__(self, base_url, username=None, password=None, token=None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        if not self.token and username and password:
            self._login(username, password)

    def _login(self, username, password):
        resp = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"username": username, "password": password},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        self.token = data.get("token") or data.get("access_token")
        if not self.token:
            raise RuntimeError("Login succeeded but no token returned")

    @property
    def _headers(self):
        return {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}

    def get_websites(self):
        resp = requests.get(f"{self.base_url}/api/websites", headers=self._headers, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_stats(self, website_id, start_at=None, end_at=None):
        if not start_at:
            start_at = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        if not end_at:
            end_at = datetime.now().strftime("%Y-%m-%d")
        params = {"startDate": f"{start_at}T00:00:00.000Z", "endDate": f"{end_at}T23:59:59.999Z"}
        resp = requests.get(
            f"{self.base_url}/api/websites/{website_id}/stats",
            headers=self._headers,
            params=params,
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def get_metrics(self, website_id, metric_type, start_at=None, end_at=None, limit=100):
        if not start_at:
            start_at = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        if not end_at:
            end_at = datetime.now().strftime("%Y-%m-%d")
        params = {
            "type": metric_type,
            "startDate": f"{start_at}T00:00:00.000Z",
            "endDate": f"{end_at}T23:59:59.999Z",
            "limit": limit,
        }
        resp = requests.get(
            f"{self.base_url}/api/websites/{website_id}/metrics",
            headers=self._headers,
            params=params,
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def get_pageview_metrics(self, website_id, start_at=None, end_at=None, limit=100):
        return self.get_metrics(website_id, "url", start_at, end_at, limit)

    def get_referrer_metrics(self, website_id, start_at=None, end_at=None, limit=50):
        return self.get_metrics(website_id, "referrer_domain", start_at, end_at, limit)

    def get_channel_metrics(self, website_id, start_at=None, end_at=None):
        if not start_at:
            start_at = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        if not end_at:
            end_at = datetime.now().strftime("%Y-%m-%d")
        params = {
            "type": "channel",
            "startDate": f"{start_at}T00:00:00.000Z",
            "endDate": f"{end_at}T23:59:59.999Z",
        }
        resp = requests.get(
            f"{self.base_url}/api/websites/{website_id}/metrics",
            headers=self._headers,
            params=params,
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def get_country_metrics(self, website_id, start_at=None, end_at=None, limit=50):
        return self.get_metrics(website_id, "country", start_at, end_at, limit)


def connect_umami(base_url, username=None, password=None, token=None):
    try:
        return UmamiClient(base_url, username=username, password=password, token=token)
    except Exception as e:
        return {"error": str(e), "type": "umami_connection"}
