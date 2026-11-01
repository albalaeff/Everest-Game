"""scripts/claude_prices.py: Claude's API prices and their history (#390)."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from scripts.claude_prices import (
    ALL,
    ClaudeComPricing,
    DailyCheck,
    DocsPricing,
    ModelPrice,
    Price,
    PriceHistory,
    PricesUnreadable,
    Tier,
    Tokens,
    model_id,
    read_prices,
)

pytestmark = pytest.mark.unit

D = Decimal
MODULE = "ApiTab-module-scss-module__YQdvya__"  # the hash changes with each build


def card(name: str, rows: str) -> str:
    return (
        f'<div class="{MODULE}modelCard"><div class="{MODULE}modelTitle">'
        f'<h3 class="{MODULE}modelName text-headline-4-serif">{name}</h3>'
        f'<p class="{MODULE}modelSubtitle">Something it is good at</p></div>'
        f'<div class="{MODULE}modelBody">{rows}</div></div>'
    )


def label(text: str) -> str:
    return f'<p class="{MODULE}priceLabel {MODULE}priceLabelSub">{text}</p>'


def value(text: str) -> str:
    return f'<p class="{MODULE}priceValue">{text}<!-- --> <!-- -->/ MTok</p>'


OPUS = card(
    "Opus 5.5",
    label("Prompt caching")
    + label("Read")
    + value("$0.20")
    + label("Write")
    + value("$5")
    + label("Input")
    + value("$4")
    + label("Output")
    + value("$20"),
)
HAIKU = card(
    "Haiku 5.5",
    label("Prompt caching")
    + label("Prompts ≤ 100K tokens")
    + label("Read")
    + value("$0.01")
    + label("Write")
    + value("$0.125")
    + label("Prompts &gt; 100K tokens")
    + label("Read")
    + value("$0.05")
    + label("Write")
    + value("$0.625")
    + label("Input")
    + label("Prompts ≤ 100K tokens")
    + value("$0.10")
    + label("Prompts &gt; 100K tokens")
    + value("$0.50")
    + label("Output")
    + label("Prompts ≤ 100K tokens")
    + value("$0.50")
    + label("Prompts &gt; 100K tokens")
    + value("$2.50"),
)
CLAUDE_COM = (
    f'<html><body><h2 class="{MODULE}heading">Compare plans</h2>'
    f'<div class="{MODULE}headingRow"><h2 class="{MODULE}heading">Latest models</h2></div>'
    f"{OPUS}{HAIKU}"
    f'<h2 class="{MODULE}heading text-headline-2-serif">Legacy models</h2>'
    f"{card('Opus 5', label('Input') + value('$5'))}</body></html>"
)

DOCS = """# Pricing

## Model pricing

| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Claude Fable 5.1 | $10 / MTok | $12.50 / MTok | $20 / MTok | $0.25 / MTok<sup>1</sup> | $50 / MTok |
| Claude Mythos 5.1 ([limited availability](https://support.claude.com/x)) | $10 / MTok | $12.50 / MTok | $20 / MTok | $0.25 / MTok | $50 / MTok |
| Claude Opus 5.5 | $4 / MTok | $5 / MTok | $8 / MTok | $0.20 / MTok<sup>2</sup> | $20 / MTok |
| Claude Opus 5 | $5 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok | $25 / MTok |
| Claude Opus 4 ([retired, except on Google Cloud](https://x)) | $15 / MTok | $18.75 / MTok | $30 / MTok | $1.50 / MTok | $75 / MTok |
| Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.10 / MTok | $0.125 / MTok | $0.20 / MTok | $0.01 / MTok | $0.50 / MTok |
| Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 / MTok | $0.625 / MTok | $1 / MTok | $0.05 / MTok | $2.50 / MTok |
| Claude Haiku 4.5 | $1 / MTok | $1.25 / MTok | $2 / MTok | $0.10 / MTok | $5 / MTok |

## Batch processing

| Model | Batch input | Batch output |
| :---- | :---- | :---- |
| Claude Opus 5.5 | $2 / MTok | $10 / MTok |
"""  # noqa: E501

OPUS_PRICE = Price(D(4), D(20), D("0.20"), D(5), D(8))
UP_TO = Tier(over=False, limit=100_000)
OVER = Tier(over=True, limit=100_000)


# --- reading the pages ---------------------------------------------------------------------


def test_claude_com_gives_the_latest_models_with_the_hour_s_cache_worked_out() -> None:
    found = ClaudeComPricing().parse(CLAUDE_COM)

    small = Price(D("0.10"), D("0.50"), D("0.01"), D("0.125"), D("0.20"))
    large = Price(D("0.50"), D("2.50"), D("0.05"), D("0.625"), D(1))
    assert found == [
        ModelPrice("claude-opus-5-5", ALL, OPUS_PRICE),  # 1 h writes: twice the input
        ModelPrice("claude-haiku-5-5", UP_TO, small),
        ModelPrice("claude-haiku-5-5", OVER, large),
    ]
    assert "claude-opus-5" not in {entry.model for entry in found}  # a legacy model


def test_the_docs_give_the_latest_of_each_family() -> None:
    found = DocsPricing().parse(DOCS)

    assert [(entry.model, str(entry.tier)) for entry in found] == [
        ("claude-fable-5-1", ""),  # Mythos: limited availability; old ones and retired: no
        ("claude-opus-5-5", ""),
        ("claude-haiku-5-5", "<=100K"),
        ("claude-haiku-5-5", ">100K"),
    ]
    assert found[1].price == OPUS_PRICE  # the footnote marks go; the batch table isn't read


def test_both_pages_agree() -> None:
    from_claude_com = {(e.model, e.tier): e for e in ClaudeComPricing().parse(CLAUDE_COM)}
    from_docs = {(e.model, e.tier): e for e in DocsPricing().parse(DOCS)}

    for key, entry in from_claude_com.items():
        assert from_docs[key] == entry  # $1 is $1.00


def test_the_docs_are_read_when_claude_com_cant_be() -> None:
    def fetch(url: str) -> str:
        if url.startswith("https://claude.com/"):
            raise httpx.ConnectError("no route")
        return DOCS

    assert len(read_prices(fetch=fetch)) == 4


def test_a_page_without_prices_counts_as_unreadable() -> None:
    with pytest.raises(PricesUnreadable) as refused:
        read_prices(fetch=lambda url: "<html>Something else</html>")

    assert "claude.com" in str(refused.value) and "platform.claude.com" in str(refused.value)


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Opus 5.5", "claude-opus-5-5"),
        ("Claude Opus 5.5", "claude-opus-5-5"),
        ("Haiku 5.5", "claude-haiku-5-5"),
    ],
)
def test_model_names_as_claude_code_logs_them(name: str, expected: str) -> None:
    assert model_id(name) == expected


# --- what tokens cost ----------------------------------------------------------------------


def test_tokens_cost_by_kind() -> None:
    tokens = Tokens(input=396, output=142_107, cache_read=42_257_449, cache_write_1h=619_330)

    # A session of 2026-10-12, as Claude Code itself totalled it: $16.2498538.
    assert OPUS_PRICE.cost(tokens) == D("16.2498538")


def test_a_prompt_is_everything_read_in() -> None:
    assert Tokens(input=1, cache_read=2, cache_write_5m=3, cache_write_1h=4, output=50).prompt == 10


# --- the history ---------------------------------------------------------------------------

DAY = date(2026, 10, 12)


def test_only_changes_are_recorded() -> None:
    history = PriceHistory()
    first = history.record([ModelPrice("claude-opus-5-5", ALL, OPUS_PRICE)], DAY)
    same = history.record([ModelPrice("claude-opus-5-5", ALL, OPUS_PRICE)], DAY + timedelta(1))
    cheaper = ModelPrice("claude-opus-5-5", ALL, Price(D(3), D(15), D("0.15"), D(4), D(6)))
    changed = history.record([cheaper], DAY + timedelta(days=30))

    assert len(first) == 1 and same == [] and len(changed) == 1
    assert len(history.rows) == 2


def test_the_price_in_force_on_a_day() -> None:
    cheaper = Price(D(3), D(15), D("0.15"), D(4), D(6))
    history = PriceHistory()
    history.record([ModelPrice("claude-opus-5-5", ALL, OPUS_PRICE)], DAY)
    history.record([ModelPrice("claude-opus-5-5", ALL, cheaper)], DAY + timedelta(days=30))

    assert history.price("claude-opus-5-5", DAY + timedelta(days=29)) == OPUS_PRICE
    assert history.price("claude-opus-5-5", DAY + timedelta(days=30)) == cheaper
    assert history.price("claude-opus-5-5", DAY - timedelta(days=5)) == OPUS_PRICE  # before
    assert history.price("claude-sonnet-4-6", DAY) is None  # never kept


def test_a_tiered_model_is_priced_by_the_prompt_and_a_dated_id_is_its_model() -> None:
    history = PriceHistory()
    history.record(DocsPricing().parse(DOCS), DAY)

    small = history.price("claude-haiku-5-5-20261001", DAY, prompt=20_000)
    large = history.price("claude-haiku-5-5", DAY, prompt=150_000)

    assert small is not None and small.input == D("0.10")
    assert large is not None and large.input == D("0.50")


def test_the_history_round_trips_through_its_file(tmp_path: Path) -> None:
    path = tmp_path / "claude-prices.csv"
    history = PriceHistory()
    history.record(DocsPricing().parse(DOCS), DAY)

    history.save(path)

    assert PriceHistory.load(path).rows == history.rows
    assert path.read_text(encoding="utf-8").splitlines()[:2] == [
        "seen,model,tier,input,output,cache_read,cache_write_5m,cache_write_1h",
        "2026-10-12,claude-fable-5-1,,10,50,0.25,12.50,20",
    ]


# --- once a day ----------------------------------------------------------------------------

NOW = datetime(2026, 10, 12, 15, 0)


def check(tmp_path: Path, page: str = CLAUDE_COM) -> DailyCheck:
    return DailyCheck(
        history=tmp_path / "claude-prices.csv",
        stamp=tmp_path / "prices-checked",
        fetch=lambda url: page if "claude.com/pricing" in url else "",
    )


def test_a_check_is_due_once_a_day(tmp_path: Path) -> None:
    daily = check(tmp_path)
    assert daily.due(NOW)  # never checked

    daily.run(NOW)

    assert not daily.due(NOW + timedelta(hours=23))
    assert daily.due(NOW + timedelta(hours=24))
    assert daily(lambda: NOW + timedelta(hours=1)) is None  # not due: nothing read


def test_new_prices_are_news_and_unchanged_ones_arent_written(tmp_path: Path) -> None:
    daily = check(tmp_path)

    first = daily.run(NOW)
    written = (tmp_path / "claude-prices.csv").stat().st_mtime_ns
    again = daily.run(NOW + timedelta(days=1))

    assert len(first.added) == 3 and "Commit them in a PR" in first.text
    assert again.added == () and again.text == "Claude's prices: unchanged (3 models)."
    assert (tmp_path / "claude-prices.csv").stat().st_mtime_ns == written


def test_a_failed_read_is_said_and_waits_a_day_too(tmp_path: Path) -> None:
    daily = check(tmp_path, page="<html>down for maintenance</html>")

    news = daily.run(NOW)

    assert news.added == () and news.text.startswith("Claude's prices: couldn't read them")
    assert not (tmp_path / "claude-prices.csv").exists()
    assert not daily.due(NOW + timedelta(hours=1))
