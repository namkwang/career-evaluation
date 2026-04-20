from __future__ import annotations

import re
from datetime import datetime

from dateutil import parser as dateutil_parser

# Matches JS: s.replace(/\(주\)|㈜|주식회사|\s/g, "")
NORM_RE = re.compile(r"\(주\)|㈜|주식회사|\s")


def norm_name(s: str | None) -> str:
    """Strip corporate suffixes and whitespace from a company name."""
    return NORM_RE.sub("", s or "")


def parse_iso(date_str: str | None) -> datetime | None:
    """Parse an ISO 8601 date string; return None on failure."""
    if not date_str:
        return None
    try:
        return dateutil_parser.isoparse(date_str)
    except (ValueError, OverflowError):
        return None


def iso_date(dt: datetime) -> str:
    """Return YYYY-MM-DD string from a datetime."""
    return dt.date().isoformat()
