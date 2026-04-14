"""Quote pricing calculator — Phase 2 Sprint 2-1.

Pure calculation layer: takes raw items + pricing rule → returns totals.
Keeps side effects out of API layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable


# ------------------------------------------------------------------
# Data containers
# ------------------------------------------------------------------

@dataclass
class LineItemInput:
    """Minimal info required to compute a line total."""
    quantity: Decimal
    unit_price: Decimal


@dataclass
class QuoteTotals:
    """Computed totals for a quote."""
    subtotal: Decimal           # sum of line totals (pre-adjustment)
    adjustment_amount: Decimal  # contract surcharge/discount
    pre_tax_amount: Decimal     # subtotal + adjustment
    tax_amount: Decimal
    total_amount: Decimal       # pre_tax + tax (= final 월 이용료 세후)
    monthly_amount: Decimal     # alias of total_amount (월 이용료 기준)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _to_decimal(v) -> Decimal:
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


def _round_currency(v: Decimal) -> Decimal:
    """Round to integer won (no sub-unit in KRW)."""
    return v.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


# ------------------------------------------------------------------
# Calculations
# ------------------------------------------------------------------

def calc_line_total(quantity, unit_price) -> Decimal:
    """Line total = quantity × unit_price (rounded to won)."""
    q = _to_decimal(quantity)
    p = _to_decimal(unit_price)
    return _round_currency(q * p)


def calc_quote_totals(
    line_totals: Iterable,
    contract_multiplier=1.0,
    tax_rate=0.1,
) -> QuoteTotals:
    """Compute quote totals from line totals + pricing rule.

    Formula:
      subtotal          = sum(line_totals)
      adjustment_amount = subtotal × (multiplier - 1)   # +20% / -5% 등
      pre_tax_amount    = subtotal + adjustment
      tax_amount        = pre_tax × tax_rate
      total_amount      = pre_tax + tax

    Args:
      line_totals: iterable of line_total values (Decimal/float/str/int)
      contract_multiplier: e.g. 1.20 for +20% surcharge, 0.95 for -5% discount
      tax_rate: e.g. 0.1 for 10% VAT
    """
    mult = _to_decimal(contract_multiplier)
    rate = _to_decimal(tax_rate)

    subtotal = sum((_to_decimal(lt) for lt in line_totals), Decimal("0"))
    adjustment = _round_currency(subtotal * (mult - Decimal("1")))
    pre_tax = _round_currency(subtotal + adjustment)
    tax = _round_currency(pre_tax * rate)
    total = _round_currency(pre_tax + tax)

    return QuoteTotals(
        subtotal=_round_currency(subtotal),
        adjustment_amount=adjustment,
        pre_tax_amount=pre_tax,
        tax_amount=tax,
        total_amount=total,
        monthly_amount=total,
    )


def lookup_price(
    pricing_rows: list[dict],
    region_code: str | None,
    bandwidth_mbps: int | None,
) -> Decimal | None:
    """Find matching row in a pricing_matrices list.

    Returns monthly_price as Decimal, or None if not found.
    """
    if not pricing_rows or region_code is None or bandwidth_mbps is None:
        return None
    for row in pricing_rows:
        if (
            row.get("region_code") == region_code
            and int(row.get("bandwidth_mbps") or 0) == int(bandwidth_mbps)
        ):
            price = row.get("monthly_price")
            return _to_decimal(price)
    return None
