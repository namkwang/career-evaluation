"""Focused TS parity tests for final_rate rounding semantics.

TS uses ``Math.round(x * 10) / 10``. Python's built-in ``round`` uses banker's
rounding. These tests pin the JS-compatible helper.
"""

from __future__ import annotations

from app.services.calculation import js_round_1


def test_zero_point_eight_times_hundred_rounds_to_eighty() -> None:
    # Exactly the case called out in the task brief.
    assert round(0.8 * 100 * 10) / 10 == 80.0
    assert js_round_1(0.8 * 100) == 80.0


def test_half_up_edges_match_js() -> None:
    # JS rounds .5 up; Python round(.5) → 0 (banker's), round(1.5) → 2, round(2.5) → 2.
    assert js_round_1(0.05) == 0.1
    assert js_round_1(0.15) == 0.2
    assert js_round_1(0.25) == 0.3
    assert js_round_1(2.5) == 2.5  # already at 1dp


def test_contract_adjustment_examples() -> None:
    # base_rate 80 × 0.8 = 64 → 64.0
    assert js_round_1(80 * 0.8) == 64.0
    # base_rate 64 × 0.8 = 51.2 → 51.2
    assert js_round_1(64 * 0.8) == 51.2
    # base_rate 20 × 0.8 = 16 → 16.0
    assert js_round_1(20 * 0.8) == 16.0
