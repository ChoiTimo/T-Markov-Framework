"""Quote PDF generator — Phase 2 Sprint 2-1.

Renders quote HTML → PDF via WeasyPrint.
System requirement: fonts-noto-cjk installed on the runtime (Dockerfile).
"""

from __future__ import annotations

from datetime import date
from io import BytesIO
from typing import Any


def _fmt_krw(n) -> str:
    try:
        return f"₩{int(float(n)):,}"
    except (TypeError, ValueError):
        return "₩0"


def _row_html(idx: int, item: dict) -> str:
    category = item.get("category") or "-"
    item_name = item.get("item_name") or "-"
    region = item.get("region_name") or item.get("region_code") or "-"
    bw = item.get("bandwidth_mbps")
    bw_text = f"{bw} Mbps" if bw else "-"
    qty = item.get("quantity") or 1
    unit = item.get("unit") or "회선"
    line_total = _fmt_krw(item.get("line_total"))
    hub_badge = " <span class='badge-hub'>Hub</span>" if item.get("is_hub") else ""
    return f"""
      <tr>
        <td class='num'>{idx}</td>
        <td>{category}</td>
        <td>{item_name}{hub_badge}</td>
        <td>{region}</td>
        <td>{bw_text}</td>
        <td class='num'>{qty} {unit}</td>
        <td class='num money'>{line_total}</td>
      </tr>
    """


def render_quote_html(quote: dict, items: list[dict], org: dict | None = None) -> str:
    """Render the quote as a standalone, printable HTML document."""
    org_name = (org or {}).get("name", "")
    quote_number = quote.get("quote_number") or "(draft)"
    title = quote.get("title") or "견적서"
    customer_name = quote.get("customer_name") or "-"
    customer_company = quote.get("customer_company") or "-"
    contract_months = quote.get("contract_months") or 0
    contract_label = {0: "무약정", 12: "1년 약정", 24: "2년 약정", 36: "3년 약정"}.get(
        contract_months, f"{contract_months}개월"
    )
    today_str = date.today().strftime("%Y년 %m월 %d일")
    valid_until = quote.get("valid_until") or "-"

    rows_html = "\n".join(_row_html(i + 1, it) for i, it in enumerate(items or []))
    if not rows_html:
        rows_html = "<tr><td colspan='7' class='empty'>견적 항목이 없습니다.</td></tr>"

    subtotal = _fmt_krw(quote.get("subtotal"))
    adjustment = _fmt_krw(quote.get("adjustment_amount"))
    tax_amount = _fmt_krw(quote.get("tax_amount"))
    total_amount = _fmt_krw(quote.get("total_amount"))

    notes = (quote.get("notes") or "").replace("\n", "<br/>")
    exceptions = (quote.get("exceptions_note") or (
        "본 견적은 월 이용료 기준이며, 표기 금액은 VAT 10% 포함 금액입니다. "
        "백업(이중화) 구성 및 특수 요구사항은 별도 협의가 필요합니다."
    )).replace("\n", "<br/>")

    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <title>{title} — {quote_number}</title>
  <style>
    @page {{ size: A4; margin: 18mm 14mm; }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: 'Noto Sans CJK KR', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
      color: #1a1a1a;
      font-size: 10pt;
      line-height: 1.5;
      margin: 0;
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #ff6b00;
      padding-bottom: 10mm;
      margin-bottom: 8mm;
    }}
    .brand {{ font-size: 14pt; font-weight: 700; color: #ff6b00; }}
    .org {{ font-size: 10pt; color: #666; margin-top: 2mm; }}
    .doc-meta {{ text-align: right; font-size: 9pt; color: #444; }}
    .doc-meta .doc-no {{ font-size: 11pt; font-weight: 700; color: #000; }}
    h1.title {{ font-size: 22pt; font-weight: 700; margin: 4mm 0 6mm; text-align: center; letter-spacing: 2pt; }}
    .info-grid {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm 8mm;
      margin-bottom: 8mm;
      border: 1px solid #e0e0e0;
      padding: 5mm;
      border-radius: 3mm;
      background: #fafafa;
    }}
    .info-grid .label {{ color: #666; font-size: 9pt; margin-bottom: 1mm; }}
    .info-grid .value {{ font-weight: 600; font-size: 11pt; color: #000; }}
    table.items {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6mm;
      font-size: 9.5pt;
    }}
    table.items th {{
      background: #f2f2f2;
      border-top: 2px solid #333;
      border-bottom: 1px solid #333;
      padding: 3mm 2mm;
      text-align: left;
      font-weight: 600;
    }}
    table.items td {{
      border-bottom: 1px solid #e0e0e0;
      padding: 2.5mm 2mm;
      vertical-align: top;
    }}
    table.items .num {{ text-align: right; white-space: nowrap; }}
    table.items .money {{ font-variant-numeric: tabular-nums; font-weight: 600; }}
    table.items .empty {{ text-align: center; color: #999; padding: 8mm; }}
    .badge-hub {{
      display: inline-block; padding: 0.5mm 2mm; margin-left: 2mm;
      font-size: 8pt; background: #ff6b00; color: #fff; border-radius: 1.5mm;
    }}
    .totals {{
      margin-left: auto;
      width: 60%;
      border-top: 2px solid #333;
      padding-top: 3mm;
    }}
    .totals .row {{
      display: flex; justify-content: space-between;
      padding: 1.5mm 0;
      border-bottom: 1px dashed #ddd;
    }}
    .totals .row.grand {{
      border-bottom: none;
      border-top: 2px solid #ff6b00;
      margin-top: 2mm;
      padding-top: 3mm;
      font-size: 13pt;
      font-weight: 700;
      color: #ff6b00;
    }}
    .totals .row .label {{ color: #444; }}
    .totals .row .value {{ font-variant-numeric: tabular-nums; }}
    .notes-block {{
      margin-top: 8mm;
      padding: 4mm;
      background: #fff8f2;
      border-left: 3px solid #ff6b00;
      border-radius: 2mm;
      font-size: 9pt;
      color: #444;
    }}
    .notes-block h4 {{ margin: 0 0 2mm; color: #c14a00; font-size: 9.5pt; }}
    .footer {{
      margin-top: 10mm;
      padding-top: 4mm;
      border-top: 1px solid #e0e0e0;
      font-size: 8.5pt;
      color: #888;
      text-align: center;
    }}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">SmartWAN Platform</div>
      <div class="org">{org_name}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-no">{quote_number}</div>
      <div>발행일: {today_str}</div>
      <div>유효기한: {valid_until}</div>
    </div>
  </div>

  <h1 class="title">견 적 서</h1>

  <div class="info-grid">
    <div>
      <div class="label">고객사</div>
      <div class="value">{customer_company}</div>
    </div>
    <div>
      <div class="label">담당자</div>
      <div class="value">{customer_name}</div>
    </div>
    <div>
      <div class="label">견적 제목</div>
      <div class="value">{title}</div>
    </div>
    <div>
      <div class="label">약정 조건</div>
      <div class="value">{contract_label}</div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:6%;">#</th>
        <th style="width:11%;">구분</th>
        <th style="width:28%;">상세 항목</th>
        <th style="width:17%;">지역</th>
        <th style="width:9%;">대역폭</th>
        <th style="width:10%;">수량</th>
        <th style="width:19%; text-align:right;">금액 (월, VAT 별도)</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>

  <div class="totals">
    <div class="row">
      <span class="label">소계</span>
      <span class="value">{subtotal}</span>
    </div>
    <div class="row">
      <span class="label">약정 조정 ({contract_label})</span>
      <span class="value">{adjustment}</span>
    </div>
    <div class="row">
      <span class="label">부가세 (10%)</span>
      <span class="value">{tax_amount}</span>
    </div>
    <div class="row grand">
      <span class="label">월 이용료 합계 (세후)</span>
      <span class="value">{total_amount}</span>
    </div>
  </div>

  <div class="notes-block">
    <h4>참고 사항</h4>
    {notes or "(별도 참고 사항 없음)"}
  </div>

  <div class="notes-block" style="background:#f5f5f5; border-left-color:#888;">
    <h4>유의 사항</h4>
    {exceptions}
  </div>

  <div class="footer">
    본 견적서는 SmartWAN Platform에서 자동 생성되었습니다. 문서 번호 {quote_number}
  </div>
</body>
</html>"""


def render_quote_pdf(quote: dict, items: list[dict], org: dict | None = None) -> bytes:
    """Generate PDF bytes. Raises RuntimeError if WeasyPrint/fonts missing."""
    try:
        from weasyprint import HTML  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "PDF generator unavailable — WeasyPrint or its system dependencies "
            "are not installed. Install 'weasyprint' and 'fonts-noto-cjk'."
        ) from e

    html_str = render_quote_html(quote, items, org)
    buf = BytesIO()
    HTML(string=html_str).write_pdf(buf)
    return buf.getvalue()
