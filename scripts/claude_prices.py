"""Claude's API prices, kept as a history in the repo (#390): docs/claude-prices.csv.

    uv run python scripts/claude_prices.py            the prices in force now
    uv run python scripts/claude_prices.py refresh    read them from the web; a row for each
                                                      model whose prices changed

The prices come from claude.com/pricing (its "Latest models", Anthropic's most up-to-date
list), or from the docs' pricing page when that can't be read. Only the latest models are
kept: a model that leaves the list keeps its last rows, for the work done with it.

claude.com gives the cache writes for the 5-minute cache only. Claude Code caches for an
hour, which costs twice the input price (the docs' "1h cache writes", true for every
model), so that's worked out.

`scripts/github.py watch` refreshes once a day (`DailyCheck`); a change is a task for
Claude, who commits the new rows in a PR. `scripts/claude_cost.py` prices the work with it.
"""

import argparse
import csv
import html
import io
import re
import sys
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, fields
from datetime import date, datetime, timedelta
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path
from typing import ClassVar

import httpx

ROOT = Path(__file__).resolve().parents[1]
HISTORY = ROOT / "docs" / "claude-prices.csv"
CHECKED = ROOT / ".claude" / "prices-checked"  # when the web was last read (not committed)
ONE_HOUR_CACHE = Decimal(2)  # an hour's cache write, times the input price
Fetch = Callable[[str], str]


class PricesUnreadable(Exception):
    """A pricing page that couldn't be read, or had no prices in it."""


# --- what a model costs --------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Price:
    """Dollars per million tokens, by kind."""

    input: Decimal
    output: Decimal
    cache_read: Decimal
    cache_write_5m: Decimal
    cache_write_1h: Decimal

    def cost(self, tokens: Tokens) -> Decimal:
        """What `tokens` cost at these prices, in dollars."""
        return (
            sum(
                (
                    self.input * tokens.input,
                    self.output * tokens.output,
                    self.cache_read * tokens.cache_read,
                    self.cache_write_5m * tokens.cache_write_5m,
                    self.cache_write_1h * tokens.cache_write_1h,
                ),
                Decimal(0),
            )
            / 1_000_000
        )


@dataclass(frozen=True, slots=True)
class Tokens:
    """A reply's tokens, by how they're priced."""

    input: int = 0
    output: int = 0
    cache_read: int = 0
    cache_write_5m: int = 0
    cache_write_1h: int = 0

    def __add__(self, other: Tokens) -> Tokens:
        return Tokens(*(getattr(self, f.name) + getattr(other, f.name) for f in fields(self)))

    @property
    def prompt(self) -> int:
        """The prompt's size, which some models' prices depend on (`Tier`)."""
        return self.input + self.cache_read + self.cache_write_5m + self.cache_write_1h


@dataclass(frozen=True, slots=True)
class Tier:
    """Where a model's price depends on the prompt's size (Haiku 5.5): up to `limit`
    tokens, or over it. ALL where it doesn't."""

    over: bool
    limit: int

    def __str__(self) -> str:
        return f"{'>' if self.over else '<='}{self.limit // 1000}K" if self.limit else ""

    @classmethod
    def parse(cls, text: str) -> Tier:
        """ "<=100K", ">100K", "": as `str` writes it."""
        if not text:
            return ALL
        match = re.fullmatch(r"(<=|>)(\d+)K", text)
        if match is None:
            raise ValueError(f"not a tier: {text!r}")
        return cls(over=match[1] == ">", limit=int(match[2]) * 1000)

    def holds(self, prompt: int) -> bool:
        return not self.limit or (prompt > self.limit) == self.over


ALL = Tier(over=False, limit=0)


def model_id(name: str) -> str:
    """ "Opus 5.5", "Claude Opus 5.5" -> "claude-opus-5-5", as Claude Code's logs name it."""
    words = name.removeprefix("Claude ").split()
    return "claude-" + "-".join(word.lower().replace(".", "-") for word in words)


@dataclass(frozen=True, slots=True)
class ModelPrice:
    model: str  # model_id
    tier: Tier
    price: Price


@dataclass(frozen=True, slots=True)
class Dated:
    """A row of the history: a model's prices as first seen on `seen`."""

    seen: date
    entry: ModelPrice


# --- where the prices are read -------------------------------------------------------------


def dollars(text: str) -> Decimal:
    """ "$0.20 / MTok", "$2 / MTok<sup>3</sup>" -> Decimal("0.20"), Decimal("2")."""
    match = re.search(r"\$\s*([\d.]+)", text)
    if match is None:
        raise PricesUnreadable(f"no price in {text!r}")
    return Decimal(match[1])


def tier_of(text: str) -> Tier | None:
    """ "Prompts ≤ 100K tokens", "for prompts over 100,000 tokens": the tier a label
    names, or None."""
    text = html.unescape(text).replace(",", "")
    match = re.search(r"(≤|<=|>|up to|over)\s*(\d+)\s*(K|000)?", text)
    if match is None or "prompt" not in text.lower():
        return None
    limit = int(match[2]) * (1000 if match[3] == "K" else 1)
    return Tier(over=match[1] in (">", "over"), limit=limit)


class PricingPage(ABC):
    """A page with the latest models' prices."""

    url: ClassVar[str]

    def read(self, fetch: Fetch) -> list[ModelPrice]:
        try:
            text = fetch(self.url)
        except httpx.HTTPError as error:
            raise PricesUnreadable(f"{self.url}: {error}") from error
        found = self.parse(text)
        if not found:
            raise PricesUnreadable(f"{self.url}: no prices found")
        return found

    @abstractmethod
    def parse(self, text: str) -> list[ModelPrice]: ...


class _Cards(HTMLParser):
    """The text of the "Latest models" cards on claude.com/pricing, in order: (role, text)
    with role "model", "label" or "value", from the cards' CSS classes (`modelName`,
    `priceLabel`, `priceValue`, whatever hash their module adds). It stops at the next
    heading after the cards: "Legacy models"."""

    ROLES: ClassVar[dict[str, str]] = {
        "modelName": "model",
        "priceLabel": "label",
        "priceValue": "value",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found: list[tuple[str, str]] = []
        self._role: str | None = None
        self._text: list[str] = []
        self._done = False

    @staticmethod
    def _classes(attrs: list[tuple[str, str | None]]) -> list[str]:
        value = dict(attrs).get("class") or ""
        return [name.rsplit("__", 1)[-1] for name in value.split()]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._done:
            return
        classes = self._classes(attrs)
        if tag == "h2" and "heading" in classes and self.found:
            self._done = True  # the next section's heading
            return
        for name, role in self.ROLES.items():
            if name in classes:
                self._role, self._text = role, []

    def handle_data(self, data: str) -> None:
        if self._role is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._role is not None and tag in ("h3", "p"):
            self.found.append((self._role, re.sub(r"\s+", " ", "".join(self._text)).strip()))
            self._role = None


class ClaudeComPricing(PricingPage):
    """claude.com/pricing's API tab: a card per model; caching (Read, Write), Input and
    Output; per tier where the prompt's size matters."""

    url = "https://claude.com/pricing"
    KINDS: ClassVar[dict[str, str]] = {
        "Read": "cache_read",
        "Write": "cache_write_5m",
        "Input": "input",
        "Output": "output",
    }

    def parse(self, text: str) -> list[ModelPrice]:
        start = text.find("Latest models")
        if start < 0:
            return []
        cards = _Cards()
        cards.feed(text[start:])
        values: dict[str, dict[Tier, dict[str, Decimal]]] = {}
        model, kind, tier = None, None, ALL
        for role, content in cards.found:
            if role == "model":
                model, kind, tier = model_id(content), None, ALL
                values[model] = {}
            elif role == "label":
                if (named := tier_of(content)) is not None:
                    tier = named
                elif content in self.KINDS:
                    kind = self.KINDS[content]
                    if content in ("Input", "Output"):
                        tier = ALL
            elif model is not None and kind is not None:
                values[model].setdefault(tier, {})[kind] = dollars(content)
        return [
            ModelPrice(name, tier, _price(by_kind))
            for name, tiers in values.items()
            for tier, by_kind in _spread(tiers).items()
        ]


def _spread(tiers: dict[Tier, dict[str, Decimal]]) -> dict[Tier, dict[str, Decimal]]:
    """A model's prices per tier, with what holds for every tier (ALL) in each one."""
    common = tiers.pop(ALL, {})
    if not tiers:
        return {ALL: common}
    return {tier: {**common, **by_kind} for tier, by_kind in tiers.items()}


def _price(by_kind: dict[str, Decimal]) -> Price:
    missing = {"input", "output", "cache_read", "cache_write_5m"} - by_kind.keys()
    if missing:
        raise PricesUnreadable(f"prices missing: {sorted(missing)}")
    one_hour = by_kind.get("cache_write_1h", by_kind["input"] * ONE_HOUR_CACHE)
    return Price(
        input=by_kind["input"],
        output=by_kind["output"],
        cache_read=by_kind["cache_read"],
        cache_write_5m=by_kind["cache_write_5m"],
        cache_write_1h=one_hour,
    )


class DocsPricing(PricingPage):
    """The docs' pricing page, as Markdown: its "Model pricing" table has every model,
    newest first in each family. The latest of each is kept; models of limited
    availability, and retired ones, are left out."""

    url = "https://platform.claude.com/docs/en/about-claude/pricing.md"
    COLUMNS: ClassVar[tuple[str, ...]] = (
        "input",
        "cache_write_5m",
        "cache_write_1h",
        "cache_read",
        "output",
    )

    def parse(self, text: str) -> list[ModelPrice]:
        if "## Model pricing" not in text:
            return []
        section = text.split("## Model pricing", 1)[1].split("\n## ", 1)[0]  # this table only
        rows = [line for line in section.splitlines() if line.startswith("| Claude ")]
        latest: dict[str, str] = {}  # family -> its latest model's name
        found = []
        for row in rows:
            cells = [cell.strip() for cell in row.strip("|").split("|")]
            name, _, note = cells[0].partition(" (")
            tier = tier_of(note) or ALL
            if note and tier is ALL:  # "limited availability", "retired..."
                continue
            family = name.split()[1]
            if latest.setdefault(family, name) != name:
                continue
            prices = dict(zip(self.COLUMNS, (dollars(cell) for cell in cells[1:6]), strict=True))
            found.append(ModelPrice(model_id(name), tier, _price(prices)))
        return found


SOURCES: tuple[PricingPage, ...] = (ClaudeComPricing(), DocsPricing())


def fetch(url: str) -> str:
    response = httpx.get(
        url, follow_redirects=True, timeout=30, headers={"User-Agent": "Mozilla/5.0 (myapp)"}
    )
    response.raise_for_status()
    return response.text


def read_prices(sources: Sequence[PricingPage] = SOURCES, fetch: Fetch = fetch) -> list[ModelPrice]:
    """The latest models' prices from the first source that can be read."""
    errors = []
    for source in sources:
        try:
            return source.read(fetch)
        except PricesUnreadable as error:
            errors.append(str(error))
    raise PricesUnreadable("; ".join(errors))


# --- the history ---------------------------------------------------------------------------


class PriceHistory:
    """docs/claude-prices.csv: a row per model (and tier) each time its prices change,
    with the day they were first seen. Rows are only ever added."""

    HEADER: ClassVar[tuple[str, ...]] = (
        "seen",
        "model",
        "tier",
        "input",
        "output",
        "cache_read",
        "cache_write_5m",
        "cache_write_1h",
    )

    def __init__(self, rows: Iterable[Dated] = ()) -> None:
        self.rows = sorted(rows, key=lambda row: row.seen)

    @classmethod
    def load(cls, path: Path = HISTORY) -> PriceHistory:
        if not path.exists():
            return cls()
        with path.open(encoding="utf-8", newline="") as file:
            return cls(cls._row(record) for record in csv.DictReader(file))

    @staticmethod
    def _row(record: dict[str, str]) -> Dated:
        price = Price(*(Decimal(record[name]) for name in PriceHistory.HEADER[3:]))
        entry = ModelPrice(record["model"], Tier.parse(record["tier"]), price)
        return Dated(date.fromisoformat(record["seen"]), entry)

    def save(self, path: Path = HISTORY) -> None:
        with path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.writer(file, lineterminator="\n")
            writer.writerow(self.HEADER)
            for row in self.rows:
                price = row.entry.price
                writer.writerow(
                    (
                        row.seen.isoformat(),
                        row.entry.model,
                        str(row.entry.tier),
                        *(str(getattr(price, name)) for name in self.HEADER[3:]),
                    )
                )

    def current(self) -> dict[tuple[str, Tier], ModelPrice]:
        """Each model's (and tier's) latest prices."""
        return {(row.entry.model, row.entry.tier): row.entry for row in self.rows}

    def record(self, found: Iterable[ModelPrice], today: date) -> list[Dated]:
        """Adds a row for each of `found` whose prices aren't the latest kept; returns
        them. Nothing is added when nothing changed."""
        current = self.current()
        added = [
            Dated(today, entry)
            for entry in found
            if current.get((entry.model, entry.tier)) != entry
        ]
        self.rows.extend(added)
        return added

    def price(self, model: str, on: date, prompt: int = 0) -> Price | None:
        """`model`'s prices on `on`, for a prompt of `prompt` tokens; a day before its
        first row takes the first. None for a model never kept. A dated model id
        ("claude-haiku-4-5-20251001") is the model's."""
        model = re.sub(r"-\d{8}$", "", model)
        rows = [row for row in self.rows if row.entry.model == model]
        rows = [row for row in rows if row.entry.tier.holds(prompt)]
        if not rows:
            return None
        before = [row for row in rows if row.seen <= on]
        return (before[-1] if before else rows[0]).entry.price


# --- once a day ----------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PriceNews:
    """What a check found: `added` rows when the prices changed."""

    text: str
    added: tuple[Dated, ...] = ()


@dataclass(frozen=True, slots=True)
class DailyCheck:
    """Reads the prices once a day (`EVERY`), from `scripts/github.py watch`. The time of
    the last try is kept in `stamp`, so a failure waits a day too, like a success."""

    history: Path = HISTORY
    stamp: Path = CHECKED
    sources: Sequence[PricingPage] = SOURCES
    fetch: Fetch = fetch

    EVERY: ClassVar[timedelta] = timedelta(days=1)

    def due(self, now: datetime) -> bool:
        try:
            last = datetime.fromisoformat(self.stamp.read_text(encoding="utf-8").strip())
        except OSError, ValueError:
            return True
        return now - last >= self.EVERY

    def run(self, now: datetime) -> PriceNews:
        """Reads the prices and keeps any change; says what it did."""
        self.stamp.parent.mkdir(parents=True, exist_ok=True)
        self.stamp.write_text(now.isoformat(), encoding="utf-8")
        try:
            found = read_prices(self.sources, self.fetch)
        except PricesUnreadable as error:
            return PriceNews(f"Claude's prices: couldn't read them ({error}).")
        history = PriceHistory.load(self.history)
        added = history.record(found, now.date())
        if not added:
            return PriceNews(f"Claude's prices: unchanged ({len(found)} models).")
        history.save(self.history)
        models = ", ".join(sorted({row.entry.model for row in added}))
        return PriceNews(
            f"Claude's prices changed ({models}): {self.history.name} has the new rows. "
            "Commit them in a PR.",
            tuple(added),
        )

    def __call__(self, now: Callable[[], datetime] = datetime.now) -> PriceNews | None:
        """For `watch`: the news when a check was due, else None."""
        moment = now()
        return self.run(moment) if self.due(moment) else None


def _by_name(item: tuple[tuple[str, Tier], ModelPrice]) -> tuple[str, str]:
    (model, tier), _ = item
    return model, str(tier)


def main(argv: Sequence[str] | None = None) -> None:
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(prog="scripts/claude_prices.py", description=__doc__)
    parser.add_argument("command", nargs="?", choices=["show", "refresh"], default="show")
    args = parser.parse_args(argv)
    if args.command == "refresh":
        print(DailyCheck().run(datetime.now()).text)
    for (model, tier), entry in sorted(PriceHistory.load().current().items(), key=_by_name):
        price = entry.price
        print(
            f"{model} {tier}".strip()
            + f": input ${price.input}, output ${price.output}, cache read ${price.cache_read},"
            f" writes ${price.cache_write_5m} (5 min) ${price.cache_write_1h} (1 h) per MTok"
        )


if __name__ == "__main__":
    main()
