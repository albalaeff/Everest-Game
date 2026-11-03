"""Writes the chronicle's deaths from the Himalayan Database's own tables (#14).

    uv run python scripts/himalayan_deaths.py <the database> --edition "Autumn-Winter 2025"
    uv run python scripts/himalayan_deaths.py <the database> --columns   # what its tables hold

The database (https://www.himalayandatabase.com/ → Downloads, free) is a zip of Visual FoxPro
tables; this reads the zip as downloaded, or the folder it unzips to. Each of Everest's dead in
its members table becomes a death record in content/facts/deaths.json, with the database's
version of the death; `--edition` is the update read, as the downloads page names it. Run again
on a later update, it writes the database's versions afresh and keeps every other source's
version and every other record (docs/conventions/knowledge-base.md → A death).
"""

import argparse
import io
import json
import re
import struct
import sys
import unicodedata
import zipfile
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path, PurePosixPath
from typing import Any, ClassVar

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # run as a script, it still finds scripts

from scripts.check_facts import FACTS  # noqa: E402
from scripts.handoff import plural  # noqa: E402

# What a table's cell holds: words, a number, a flag or a date, or nothing.
Value = str | int | float | bool | date | None


class Memo:
    """A table's memo file (.fpt): the long texts its rows point to, by block."""

    def __init__(self, data: bytes) -> None:
        self._data = data
        self._block = struct.unpack_from(">H", data, 6)[0] if data else 0

    def text(self, block: int, encoding: str) -> str:
        """The text that starts at this block: none at block 0."""
        if not block:
            return ""
        if not self._data:
            raise ValueError("a row points to a note, and the table has no memo file")
        start = block * self._block
        _, length = struct.unpack_from(">II", self._data, start)
        return self._data[start + 8 : start + 8 + length].decode(encoding)


@dataclass(frozen=True, slots=True)
class Column:
    """A column of a table, as the table's header describes it."""

    name: str
    kind: str
    offset: int
    size: int
    decimals: int

    # The types read: words, numbers, dates, flags, notes, whole numbers and doubles, and
    # Visual FoxPro's own hidden column for its null flags.
    KINDS: ClassVar[str] = "CNFDLMIB0"
    TRUE: ClassVar[frozenset[str]] = frozenset("TtYy")
    FALSE: ClassVar[frozenset[str]] = frozenset("FfNn")

    @property
    def hidden(self) -> bool:
        return self.kind == "0"

    def __str__(self) -> str:
        return f"{self.name} {self.kind}{self.size}"

    def read(self, row: bytes, memo: Memo, encoding: str) -> Value:
        """Its cell in this row: blank words read as "", a blank anything else as None."""
        raw = row[self.offset : self.offset + self.size]
        if self.kind in "NFDL" and not raw.strip(b" \0"):
            return None
        match self.kind:
            case "C":
                return raw.decode(encoding).rstrip(" \0")
            case "N" | "F":
                text = raw.decode("ascii").strip()
                return float(text) if self.decimals else int(text)
            case "D":
                text = raw.decode("ascii")
                return (
                    date(int(text[:4]), int(text[4:6]), int(text[6:])) if text.strip("0") else None
                )
            case "L":
                flag = raw.decode("ascii")
                return True if flag in self.TRUE else False if flag in self.FALSE else None
            case "M":
                block = (
                    int.from_bytes(raw, "little") if self.size == 4 else int(raw.strip() or b"0")
                )
                return memo.text(block, encoding)
            case "I":
                return int.from_bytes(raw, "little", signed=True)
            case _:
                return float(struct.unpack("<d", raw)[0])


class Table:
    """A Visual FoxPro table (.dbf), with its memo file (.fpt), from their bytes."""

    # The code page the header names, as Python calls it; Windows' Western one when it names none.
    ENCODINGS: ClassVar[dict[int, str]] = {
        0x01: "cp437",
        0x02: "cp850",
        0x03: "cp1252",
        0xC8: "cp1250",
        0xC9: "cp1251",
    }

    def __init__(self, name: str, data: bytes, memo: bytes = b"") -> None:
        self.name = name
        self._data = data
        self._memo = Memo(memo)
        count, start, size = struct.unpack_from("<IHH", data, 4)
        self._count, self._start, self._size = int(count), int(start), int(size)
        self._encoding = self.ENCODINGS.get(data[29], "cp1252")
        self._columns = list(self._read_columns())

    @property
    def columns(self) -> list[Column]:
        """Its columns, but Visual FoxPro's hidden one."""
        return [column for column in self._columns if not column.hidden]

    def __len__(self) -> int:
        return self._count

    def rows(self) -> Iterator[dict[str, Value]]:
        """Its rows, but those deleted, by column name."""
        for number in range(self._count):
            at = self._start + number * self._size
            row = self._data[at : at + self._size]
            if row[:1] == b"*":
                continue
            yield {
                column.name: column.read(row, self._memo, self._encoding) for column in self.columns
            }

    def _read_columns(self) -> Iterator[Column]:
        """The header's column descriptors, to its end mark: each column follows the last in a
        row, after the row's deletion mark."""
        offset = 1
        for at in range(32, self._start, 32):
            if self._data[at] == 0x0D:
                return
            name = self._data[at : at + 11].split(b"\0")[0].decode("ascii")
            kind = chr(self._data[at + 11])
            size, decimals = self._data[at + 16], self._data[at + 17]
            if kind not in Column.KINDS:
                raise ValueError(f"{self.name}: {name} is of type {kind}, which this doesn't read")
            yield Column(name, kind, offset, size, decimals)
            offset += size


class Database:
    """The Himalayan Database's tables: in the zip it's downloaded as, in any folder there, or
    in the folder it unzips to, by name whatever the case."""

    def __init__(self, path: Path) -> None:
        self._path = path
        # Each file's name in lowercase, and where it is in the folder or the zip.
        self._files: dict[str, str] = {}
        if path.is_dir():
            for file in sorted(path.rglob("*")):
                if file.is_file():
                    self._files.setdefault(file.name.lower(), str(file.relative_to(path)))
        else:
            with zipfile.ZipFile(path) as archive:
                for name in archive.namelist():
                    if not name.endswith("/"):
                        self._files.setdefault(PurePosixPath(name).name.lower(), name)

    @property
    def names(self) -> list[str]:
        """The tables it has."""
        return sorted(name.removesuffix(".dbf") for name in self._files if name.endswith(".dbf"))

    def table(self, name: str) -> Table:
        data = self._read(f"{name}.dbf")
        if data is None:
            has = ", ".join(self.names) or "none"
            raise LookupError(f"no table {name} in {self._path}: it has {has}")
        return Table(name, data, self._read(f"{name}.fpt") or b"")

    def _read(self, name: str) -> bytes | None:
        where = self._files.get(name)
        if where is None:
            return None
        if self._path.is_dir():
            return (self._path / where).read_bytes()
        with zipfile.ZipFile(self._path) as archive:
            return archive.read(where)


@dataclass(frozen=True, slots=True)
class Edition:
    """The database as read: the update, as its downloads page names it, and the day."""

    name: str
    checked: date


def slug(text: str) -> str:
    """Words as an id has them: plain lowercase letters and digits, joined by hyphens."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return "-".join(re.findall(r"[a-z0-9]+", plain.lower()))


class Dead:
    """One of Everest's dead, as a row of the database's members table has them."""

    URL: ClassVar[str] = "https://www.himalayandatabase.com/"
    PEAK: ClassVar[str] = "EVER"
    COLUMNS: ClassVar[tuple[str, ...]] = (
        "EXPID",
        "MEMBID",
        "PEAKID",
        "MYEAR",
        "MSEASON",
        "FNAME",
        "LNAME",
        "CITIZEN",
        "HIRED",
        "DEATH",
        "DEATHDATE",
        "DEATHTYPE",
        "DEATHHGTM",
        "DEATHCLASS",
        "DEATHNOTE",
    )
    # Its codes for the cause and for where on the climb, as its member records online name
    # them: the knowledge base's names for both are the database's own.
    CAUSES: ClassVar[dict[int, str]] = {
        1: "altitude-sickness",
        2: "exhaustion",
        3: "exposure",
        4: "fall",
        5: "crevasse",
        6: "icefall-collapse",
        7: "avalanche",
        8: "falling-rock-or-ice",
        9: "disappearance",
        10: "illness",
        11: "other",
        12: "unknown",
    }
    PHASES: ClassVar[dict[int, str]] = {
        1: "approach",
        2: "base-camp",
        3: "route-preparation",
        4: "ascent",
        5: "descent",
        6: "evacuation",
        7: "other",
    }
    WINTER: ClassVar[int] = 4  # the season: 1 spring, 2 summer, 3 autumn, 4 winter

    def __init__(self, row: Mapping[str, Value], edition: Edition) -> None:
        self._row = row
        self._edition = edition

    @classmethod
    def among(cls, members: Table, edition: Edition) -> list[Dead]:
        """Everest's dead in the members table, in its order."""
        has = {column.name for column in members.columns}
        missing = [name for name in cls.COLUMNS if name not in has]
        if missing:
            raise LookupError(f"{members.name} has no {', '.join(missing)}, which this reads")
        return [
            cls(row, edition)
            for row in members.rows()
            if row["PEAKID"] == cls.PEAK and row["DEATH"]
        ]

    @property
    def member(self) -> str:
        """Who they were to the database. An expedition's id comes back a century on (EVER21101
        is 1921's and 2021's), so the year comes first, and in that order they sort."""
        row = self._row
        return f"{row['MYEAR']} expedition {row['EXPID']}, member {row['MEMBID']}"

    @property
    def name(self) -> str:
        parts = (self._row["FNAME"], self._row["LNAME"])
        return " ".join(str(part) for part in parts if part) or "Unknown"

    @property
    def day(self) -> str:
        """The day of the death, or the expedition's year where the database gives none."""
        died = self._row["DEATHDATE"]
        if isinstance(died, date):
            return died.isoformat()
        if self._row["MSEASON"] == self.WINTER:
            raise ValueError(f"{self.member}: no day of death, and a winter runs into two years")
        return str(self._row["MYEAR"])

    @property
    def id(self) -> str:
        return f"deaths.{self.day}-{slug(self.name)}"

    def version(self) -> dict[str, Any]:
        """What the database says of the death: no altitude or note where it gives none."""
        row = self._row
        found: dict[str, Any] = {"date": self.day}
        if row["DEATHHGTM"]:
            found["altitude"] = row["DEATHHGTM"]
        found["cause"] = self._named("DEATHTYPE", self.CAUSES)
        found["phase"] = self._named("DEATHCLASS", self.PHASES)
        if row["DEATHNOTE"]:
            found["note"] = row["DEATHNOTE"]
        title = f"The Himalayan Database, {self._edition.name}: {self.member}"
        source = {"title": title, "url": self.URL}
        return found | {"source": source, "checked": self._edition.checked.isoformat()}

    def record(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": "death",
            "name": self.name,
            "citizenship": self._row["CITIZEN"],
            "hired": bool(self._row["HIRED"]),
            "status": "source only",
            "versions": [self.version()],
        }

    def _named(self, column: str, names: Mapping[int, str]) -> str:
        code = self._row[column]
        if not isinstance(code, int) or code not in names:
            raise ValueError(f"{self.member}: {column} {code}, a code this doesn't know")
        return names[code]


@dataclass(slots=True)
class Changes:
    """What a reading of the database changed in the chronicle, by record."""

    new: list[str] = field(default_factory=list)
    changed: list[str] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)


class Chronicle:
    """The chronicle's file of deaths: the database's dead, and the records other sources add."""

    SCHEMA: ClassVar[str] = "../facts.schema.json"
    # What the database says of the dead beyond its version of the death.
    TOLD: ClassVar[tuple[str, ...]] = ("name", "citizenship", "hired")

    def __init__(self, path: Path) -> None:
        self._path = path
        self.records: list[dict[str, Any]] = (
            json.loads(path.read_text(encoding="utf-8"))["facts"] if path.exists() else []
        )

    def add(self, dead: Iterable[Dead]) -> Changes:
        """The database's dead as it tells them now. Each death's version from it is written
        afresh beside the other sources' versions, and a reviewed death it now tells otherwise
        is open again. A death it no longer has loses its version, and goes when no other
        source has it. Two of one name on one day get -2, -3 in the database's order."""
        changes = Changes()
        told = {
            self._member(record): record
            for record in self.records
            if record["kind"] == "death" and self._member(record)
        }
        taken = {record["id"] for record in self.records}
        for one in sorted(dead, key=lambda one: one.member):
            found = one.record()
            record = told.pop(one.member, None)
            if record is None:
                found["id"] = self._free(found["id"], taken)
                taken.add(found["id"])
                self.records.append(found)
                changes.new.append(found["id"])
                continue
            [version] = found["versions"]
            before = [self._said(old) for old in record["versions"] if self._ours(old)]
            if before != [self._said(version)] or any(
                record[name] != found[name] for name in self.TOLD
            ):
                record["status"] = "source only"
                changes.changed.append(record["id"])
            record |= {name: found[name] for name in self.TOLD}
            record["versions"] = [version if self._ours(old) else old for old in record["versions"]]
        for record in told.values():
            record["versions"] = [old for old in record["versions"] if not self._ours(old)]
            changes.dropped.append(record["id"])
        self.records = [
            record for record in self.records if record["kind"] != "death" or record["versions"]
        ]
        others = [record for record in self.records if record["kind"] != "death"]
        deaths = [record for record in self.records if record["kind"] == "death"]
        self.records = others + sorted(deaths, key=self._when)
        return changes

    def write(self) -> None:
        data = {"$schema": self.SCHEMA, "facts": self.records}
        text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        self._path.write_text(text, encoding="utf-8", newline="\n")

    @staticmethod
    def _ours(version: Mapping[str, Any]) -> bool:
        """Whether the version is the database's."""
        return bool(version["source"]["url"] == Dead.URL)

    @classmethod
    def _member(cls, record: Mapping[str, Any]) -> str:
        """Who the record is to the database, from its version's source; none for a death it
        doesn't tell."""
        for version in record["versions"]:
            if cls._ours(version):
                return str(version["source"]["title"]).rpartition(": ")[2]
        return ""

    @staticmethod
    def _said(version: Mapping[str, Any]) -> dict[str, Any]:
        """What a version says, without its source and the day it was read."""
        return {key: value for key, value in version.items() if key not in ("source", "checked")}

    @staticmethod
    def _free(id: str, taken: set[str]) -> str:
        """The id, or the first of it with -2, -3 after that no other record has."""
        found, number = id, 1
        while found in taken:
            number += 1
            found = f"{id}-{number}"
        return found

    @staticmethod
    def _when(record: Mapping[str, Any]) -> tuple[str, str]:
        """The deaths' order: by the first date their sources give, a year before its days."""
        dates = [version["date"] for version in record["versions"] if "date" in version]
        return min(dates, default=""), str(record["id"])


def main(argv: Sequence[str] | None = None) -> int:
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(
        prog="scripts/himalayan_deaths.py", description=__doc__.split("\n")[0]
    )
    parser.add_argument("database", type=Path, help="the database's zip, or its folder")
    parser.add_argument("--columns", action="store_true", help="list its tables' columns")
    parser.add_argument(
        "--edition", help="the update read, as the downloads page names it: Autumn-Winter 2025"
    )
    parser.add_argument(
        "--checked",
        type=date.fromisoformat,
        default=date.today(),
        help="the day it was read, YYYY-MM-DD: today",
    )
    parser.add_argument(
        "--out", type=Path, default=FACTS / "deaths.json", help="content/facts/deaths.json"
    )
    args = parser.parse_args(argv)
    if not args.columns and not args.edition:
        parser.error("--edition: the update read, which the records' source names")
    database = Database(args.database)
    if args.columns:
        for name in database.names:
            found = database.table(name)
            columns = ", ".join(str(column) for column in found.columns)
            print(f"{name}: {plural(len(found), 'row')}: {columns}")
        return 0
    edition = Edition(args.edition, args.checked)
    dead = Dead.among(database.table("members"), edition)
    chronicle = Chronicle(args.out)
    changes = chronicle.add(dead)
    chronicle.write()
    dropped = f" No longer in it: {', '.join(changes.dropped)}." if changes.dropped else ""
    print(
        f"{args.out.name}: {plural(len(dead), 'death')} on Everest from the Himalayan Database,"
        f" {edition.name}: {len(changes.new)} new, {len(changes.changed)} changed.{dropped}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
