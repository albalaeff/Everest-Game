"""scripts/himalayan_deaths.py: the chronicle's deaths from the Himalayan Database (#14)."""

import json
import struct
import zipfile
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from scripts.check_facts import SCHEMA, KnowledgeBase
from scripts.himalayan_deaths import Chronicle, Database, Dead, Edition, Table, Value, main

Column = tuple[str, str, int, int]  # name, type, size, decimals
EDITION = Edition("Autumn-Winter 2025", date(2026, 11, 3))
URL = "https://www.himalayandatabase.com/"


def table(
    columns: list[Column], rows: list[list[bytes]], deleted: frozenset[int] = frozenset()
) -> bytes:
    """A Visual FoxPro table's bytes: the header, a descriptor per column, and the rows, each a
    deletion mark and its columns' bytes."""
    header_size = 32 + 32 * len(columns) + 1 + 263  # the 263: Visual FoxPro's database link
    row_size = 1 + sum(size for _, _, size, _ in columns)
    data = struct.pack("<B3BIHH", 0x30, 125, 11, 3, len(rows), header_size, row_size)
    data += bytes(16) + bytes([0x02, 0x03]) + bytes(2)  # has a memo; code page 1252
    offset = 1
    for name, kind, size, decimals in columns:
        data += name.encode("ascii").ljust(11, b"\0") + kind.encode("ascii")
        data += struct.pack("<IBB", offset, size, decimals) + bytes(14)
        offset += size
    data += b"\r" + bytes(263)
    for number, row in enumerate(rows):
        data += (b"*" if number in deleted else b" ") + b"".join(row)
    return data + b"\x1a"


def memo(*texts: str, block: int = 64) -> bytes:
    """A memo file's bytes: a 512-byte header, then each text in the blocks after it, the first
    at block 8."""
    data = struct.pack(">IHH", 0, 0, block).ljust(512, b"\0")
    for text in texts:
        body = text.encode("cp1252")
        body = struct.pack(">II", 1, len(body)) + body  # a text's type, and its length
        data += body.ljust(-(-len(body) // block) * block, b"\0")  # to whole blocks
    return data


def pointer(block: int) -> bytes:
    return struct.pack("<I", block)


COLUMNS: list[Column] = [
    ("NAME", "C", 10, 0),
    ("HEIGHT", "N", 4, 0),
    ("DIED", "D", 8, 0),
    ("HIRED", "L", 1, 0),
    ("NOTE", "M", 4, 0),
    ("ROUTE", "I", 4, 0),
]


@pytest.mark.unit
class TestTable:
    def test_it_reads_each_column_as_its_type(self) -> None:
        row = [b"Mall\xf6ry".ljust(10), b"8160", b"19240608", b"F", pointer(8), pointer(2)]
        found = list(Table("members", table(COLUMNS, [row]), memo("Fell on the NE Ridge")).rows())
        assert found == [
            {
                "NAME": "Mallöry",
                "HEIGHT": 8160,
                "DIED": date(1924, 6, 8),
                "HIRED": False,
                "NOTE": "Fell on the NE Ridge",
                "ROUTE": 2,
            }
        ]

    def test_a_blank_number_date_flag_or_note_is_none_or_empty(self) -> None:
        row = [b"".ljust(10), b"    ", b"        ", b" ", pointer(0), pointer(0)]
        found = next(Table("members", table(COLUMNS, [row])).rows())
        assert found == {
            "NAME": "",
            "HEIGHT": None,
            "DIED": None,
            "HIRED": None,
            "NOTE": "",
            "ROUTE": 0,
        }

    def test_a_note_longer_than_a_block_reads_whole(self) -> None:
        long = "x" * 100
        row = [b"A".ljust(10), b"   1", b"19240608", b"T", pointer(9), pointer(1)]
        found = next(Table("members", table(COLUMNS, [row]), memo("short", long)).rows())
        assert found["NOTE"] == long

    def test_a_deleted_row_is_left_out(self) -> None:
        names = [b"A".ljust(10), b"B".ljust(10)]
        rows = [[name, b"   1", b"19240608", b"T", pointer(0), pointer(1)] for name in names]
        found = Table("members", table(COLUMNS, rows, deleted=frozenset({0}))).rows()
        assert [row["NAME"] for row in found] == ["B"]

    def test_it_names_its_columns(self) -> None:
        assert [str(column) for column in Table("members", table(COLUMNS, [])).columns] == [
            "NAME C10",
            "HEIGHT N4",
            "DIED D8",
            "HIRED L1",
            "NOTE M4",
            "ROUTE I4",
        ]

    def test_a_column_of_a_type_it_doesn_t_read_says_which(self) -> None:
        with pytest.raises(ValueError, match="PICTURE"):
            Table("members", table([("PICTURE", "G", 4, 0)], []))


@pytest.mark.unit
class TestDatabase:
    def zipped(self, tmp_path: Path, names: dict[str, bytes]) -> Path:
        path = tmp_path / "Himalayan Database.zip"
        with zipfile.ZipFile(path, "w") as archive:
            for name, data in names.items():
                archive.writestr(name, data)
        return path

    def test_it_finds_a_table_and_its_memo_in_a_zip_s_folder_whatever_the_case(
        self, tmp_path: Path
    ) -> None:
        row = [b"A".ljust(10), b"   1", b"19240608", b"T", pointer(8), pointer(1)]
        path = self.zipped(
            tmp_path,
            {"HIMDATA/MEMBERS.DBF": table(COLUMNS, [row]), "HIMDATA/members.FPT": memo("note")},
        )
        assert next(Database(path).table("members").rows())["NOTE"] == "note"

    def test_it_reads_a_folder_too(self, tmp_path: Path) -> None:
        row = [b"A".ljust(10), b"   1", b"19240608", b"T", pointer(0), pointer(1)]
        (tmp_path / "members.dbf").write_bytes(table(COLUMNS, [row]))
        assert next(Database(tmp_path).table("members").rows())["NAME"] == "A"

    def test_a_table_it_doesn_t_have_says_which_it_has(self, tmp_path: Path) -> None:
        path = self.zipped(tmp_path, {"HIMDATA/exped.DBF": table(COLUMNS, [])})
        with pytest.raises(LookupError, match="exped"):
            Database(path).table("members")


# --- the dead -------------------------------------------------------------------------------------

# The members table's columns that the deaths are read from, as the database has them.
MEMBERS: list[Column] = [
    ("EXPID", "C", 9, 0),
    ("MEMBID", "C", 2, 0),
    ("PEAKID", "C", 4, 0),
    ("MYEAR", "C", 4, 0),
    ("MSEASON", "N", 1, 0),
    ("FNAME", "C", 35, 0),
    ("LNAME", "C", 35, 0),
    ("CITIZEN", "C", 25, 0),
    ("HIRED", "L", 1, 0),
    ("DEATH", "L", 1, 0),
    ("DEATHDATE", "D", 8, 0),
    ("DEATHTYPE", "N", 2, 0),
    ("DEATHHGTM", "N", 4, 0),
    ("DEATHCLASS", "N", 1, 0),
    ("DEATHNOTE", "C", 252, 0),
]


def member(**cells: Value) -> dict[str, Value]:
    """A row of the members table, made up, as everything about it is: a climber who died of
    exposure on the way down from a summit bid."""
    row: dict[str, Value] = {
        "EXPID": "EVER90101",
        "MEMBID": "03",
        "PEAKID": "EVER",
        "MYEAR": "1990",
        "MSEASON": 1,
        "FNAME": "A.",
        "LNAME": "Climber",
        "CITIZEN": "Nowhere",
        "HIRED": False,
        "DEATH": True,
        "DEATHDATE": date(1990, 5, 11),
        "DEATHTYPE": 3,
        "DEATHHGTM": 8750,
        "DEATHCLASS": 5,
        "DEATHNOTE": "Caught by the storm on the way down",
    }
    return row | cells


def cell(value: Value, kind: str, size: int) -> bytes:
    """A value as a column of this type and size holds it."""
    if value is None:
        return b" " * size
    if kind == "L":
        return b"T" if value else b"F"
    if isinstance(value, date):
        return value.strftime("%Y%m%d").encode("ascii")
    if kind == "N":
        return str(value).rjust(size).encode("ascii")
    return str(value).encode("cp1252").ljust(size)


def members(*rows: dict[str, Value], columns: list[Column] = MEMBERS) -> bytes:
    """The members table's bytes, with these rows."""
    cells = [[cell(row[name], kind, size) for name, kind, size, _ in columns] for row in rows]
    return table(columns, cells)


def title(member: str = "03", year: str = "1990", edition: str = "Autumn-Winter 2025") -> str:
    return f"The Himalayan Database, {edition}: {year} expedition EVER90101, member {member}"


@pytest.mark.unit
class TestDead:
    def test_a_member_s_death_reads_as_a_death_record(self) -> None:
        assert Dead(member(), EDITION).record() == {
            "id": "deaths.1990-05-11-a-climber",
            "kind": "death",
            "name": "A. Climber",
            "citizenship": "Nowhere",
            "hired": False,
            "status": "source only",
            "versions": [
                {
                    "date": "1990-05-11",
                    "altitude": 8750,
                    "cause": "exposure",
                    "phase": "descent",
                    "note": "Caught by the storm on the way down",
                    "source": {"title": title(), "url": URL},
                    "checked": "2026-11-03",
                }
            ],
        }

    def test_a_hired_member_is_hired(self) -> None:
        assert Dead(member(HIRED=True), EDITION).record()["hired"] is True

    @pytest.mark.parametrize(
        "code, cause",
        [
            (1, "altitude-sickness"),
            (2, "exhaustion"),
            (3, "exposure"),
            (4, "fall"),
            (5, "crevasse"),
            (6, "icefall-collapse"),
            (7, "avalanche"),
            (8, "falling-rock-or-ice"),
            (9, "disappearance"),
            (10, "illness"),
            (11, "other"),
            (12, "unknown"),
        ],
    )
    def test_each_death_type_is_a_cause(self, code: int, cause: str) -> None:
        assert Dead(member(DEATHTYPE=code), EDITION).version()["cause"] == cause

    @pytest.mark.parametrize(
        "code, phase",
        [
            (1, "approach"),
            (2, "base-camp"),
            (3, "route-preparation"),
            (4, "ascent"),
            (5, "descent"),
            (6, "evacuation"),
            (7, "other"),
        ],
    )
    def test_each_death_class_is_a_phase(self, code: int, phase: str) -> None:
        assert Dead(member(DEATHCLASS=code), EDITION).version()["phase"] == phase

    @pytest.mark.parametrize("column", ["DEATHTYPE", "DEATHCLASS"])
    def test_a_code_it_doesn_t_know_says_whose_and_which(self, column: str) -> None:
        with pytest.raises(ValueError, match=f"EVER90101.*{column} 13"):
            Dead(member(**{column: 13}), EDITION).record()

    def test_the_id_is_the_day_and_the_name_in_plain_lowercase(self) -> None:
        assert Dead(member(FNAME="Jiří (Jirka)", LNAME="Novák"), EDITION).id == (
            "deaths.1990-05-11-jiri-jirka-novak"
        )

    def test_a_death_the_database_doesn_t_date_takes_the_expedition_s_year(self) -> None:
        dead = Dead(member(DEATHDATE=None), EDITION)
        assert (dead.id, dead.version()["date"]) == ("deaths.1990-a-climber", "1990")

    def test_an_undated_death_in_winter_has_no_year_to_take(self) -> None:
        # A winter's expedition runs from December into the next year
        with pytest.raises(ValueError, match="winter"):
            Dead(member(DEATHDATE=None, MSEASON=4), EDITION).record()

    def test_what_the_database_leaves_blank_stays_out(self) -> None:
        version = Dead(member(DEATHHGTM=0, DEATHNOTE=""), EDITION).version()
        assert "altitude" not in version
        assert "note" not in version

    def test_one_the_database_doesn_t_name_is_unknown(self) -> None:
        assert Dead(member(FNAME="", LNAME=""), EDITION).name == "Unknown"

    def test_from_the_members_table_it_takes_everest_s_dead(self) -> None:
        rows = [member(), member(MEMBID="04", DEATH=False), member(MEMBID="05", PEAKID="LHOT")]
        found = Dead.among(Table("members", members(*rows)), EDITION)
        assert [dead.id for dead in found] == ["deaths.1990-05-11-a-climber"]

    def test_a_column_it_reads_and_the_table_lacks_is_named(self) -> None:
        columns = [column for column in MEMBERS if column[0] != "DEATHCLASS"]
        with pytest.raises(LookupError, match="DEATHCLASS"):
            Dead.among(Table("members", members(member(), columns=columns)), EDITION)


# --- the chronicle's file -------------------------------------------------------------------------

NEWS = {"title": "A newspaper", "url": "https://example.com/news"}
TOTAL: dict[str, Any] = {
    "id": "deaths.recorded-through-2025",
    "kind": "fact",
    "claim": "The deaths recorded.",
    "status": "source only",
    "versions": [{"value": 1, "unit": "deaths", "source": NEWS, "checked": "2026-11-02"}],
}


def news(**fields: Any) -> dict[str, Any]:
    """What another source says of the death."""
    said = {"date": "1990-05-12", "place": "South Summit", "note": "In the news."}
    return said | {"source": NEWS, "checked": "2026-11-02"} | fields


def chronicle(tmp_path: Path, *records: dict[str, Any]) -> Chronicle:
    """The chronicle's file with these records, or none yet."""
    path = tmp_path / "deaths.json"
    if records:
        path.write_text(json.dumps({"facts": list(records)}), encoding="utf-8")
    return Chronicle(path)


def ids(found: Chronicle) -> list[str]:
    return [record["id"] for record in found.records]


@pytest.mark.unit
class TestChronicle:
    def test_a_new_file_has_the_deaths_by_day(self, tmp_path: Path) -> None:
        found = chronicle(tmp_path)
        later = member(MEMBID="04", FNAME="B.", DEATHDATE=date(1991, 5, 1))
        found.add([Dead(later, EDITION), Dead(member(), EDITION)])
        found.write()
        data = json.loads((tmp_path / "deaths.json").read_text(encoding="utf-8"))
        assert data["$schema"] == "../facts.schema.json"
        assert [record["id"] for record in data["facts"]] == [
            "deaths.1990-05-11-a-climber",
            "deaths.1991-05-01-b-climber",
        ]

    def test_it_writes_the_database_s_version_afresh_and_keeps_the_rest(
        self, tmp_path: Path
    ) -> None:
        old = Dead(member(DEATHNOTE="An older note"), EDITION).record()
        found = chronicle(tmp_path, TOTAL, old | {"versions": [*old["versions"], news()]})
        changes = found.add([Dead(member(), EDITION)])
        assert found.records[0] == TOTAL
        notes = [version["note"] for version in found.records[1]["versions"]]
        assert notes == ["Caught by the storm on the way down", "In the news."]
        assert changes.changed == ["deaths.1990-05-11-a-climber"]

    def test_a_death_only_other_sources_have_stays_as_it_is(self, tmp_path: Path) -> None:
        spring = Dead(member(), EDITION).record() | {"id": "deaths.2026-05-22-c-climber"}
        spring |= {"versions": [news(date="2026-05-22")]}
        found = chronicle(tmp_path, spring)
        found.add([Dead(member(), EDITION)])
        assert ids(found) == ["deaths.1990-05-11-a-climber", "deaths.2026-05-22-c-climber"]
        assert found.records[1] == spring

    def test_a_death_the_database_no_longer_has_goes_unless_another_source_has_it(
        self, tmp_path: Path
    ) -> None:
        gone = Dead(member(MEMBID="09", FNAME="D."), EDITION).record()
        told = Dead(member(MEMBID="08", FNAME="E."), EDITION).record()
        told |= {"versions": [*told["versions"], news()]}
        found = chronicle(tmp_path, gone, told)
        changes = found.add([Dead(member(), EDITION)])
        assert ids(found) == ["deaths.1990-05-11-a-climber", "deaths.1990-05-11-e-climber"]
        assert found.records[1]["versions"] == [news()]
        assert changes.dropped == ["deaths.1990-05-11-d-climber", "deaths.1990-05-11-e-climber"]

    def test_two_of_one_name_on_one_day_are_told_apart_in_the_database_s_order(
        self, tmp_path: Path
    ) -> None:
        found = chronicle(tmp_path)
        found.add([Dead(member(MEMBID="05"), EDITION), Dead(member(MEMBID="02"), EDITION)])
        titles = {
            record["id"]: record["versions"][0]["source"]["title"] for record in found.records
        }
        assert titles == {
            "deaths.1990-05-11-a-climber": title("02"),
            "deaths.1990-05-11-a-climber-2": title("05"),
        }

    def test_a_reviewed_death_the_database_now_tells_otherwise_is_open_again(
        self, tmp_path: Path
    ) -> None:
        reviewed = Dead(member(), EDITION).record() | {"status": "expert-reviewed"}
        found = chronicle(tmp_path, reviewed)
        found.add([Dead(member(DEATHHGTM=8700), EDITION)])
        assert found.records[0]["status"] == "source only"

    def test_a_reviewed_death_read_again_in_a_new_edition_stays_reviewed(
        self, tmp_path: Path
    ) -> None:
        older = Edition("Spring 2025", date(2025, 9, 1))
        found = chronicle(tmp_path, Dead(member(), older).record() | {"status": "expert-reviewed"})
        changes = found.add([Dead(member(), EDITION)])
        assert found.records[0]["status"] == "expert-reviewed"
        assert found.records[0]["versions"][0]["checked"] == "2026-11-03"
        assert (changes.new, changes.changed) == ([], [])


class TestMain:
    def test_it_writes_everest_s_dead_as_the_knowledge_base_takes_them(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        database = tmp_path / "HIMDATA 2025-3.zip"
        with zipfile.ZipFile(database, "w") as archive:
            rows = members(member(), member(MEMBID="04", DEATH=False), member(MEMBID="05"))
            archive.writestr("HIMDATA/members.DBF", rows)
        facts = tmp_path / "facts"
        facts.mkdir()
        out = facts / "deaths.json"
        edition = ["--edition", "Autumn-Winter 2025", "--checked", "2026-11-03"]
        assert main([str(database), *edition, "--out", str(out)]) == 0
        assert [
            str(problem) for problem in KnowledgeBase(facts, SCHEMA, date(2026, 11, 3)).problems()
        ] == []
        assert capsys.readouterr().out == (
            "deaths.json: 2 deaths on Everest from the Himalayan Database, Autumn-Winter 2025:"
            " 2 new, 0 changed.\n"
        )

    def test_it_lists_the_tables_columns(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        (tmp_path / "members.dbf").write_bytes(members())
        assert main([str(tmp_path), "--columns"]) == 0
        assert capsys.readouterr().out.startswith("members: 0 rows: EXPID C9, MEMBID C2, ")

    def test_it_writes_nothing_without_the_edition(self, tmp_path: Path) -> None:
        (tmp_path / "members.dbf").write_bytes(members(member()))
        with pytest.raises(SystemExit):
            main([str(tmp_path), "--out", str(tmp_path / "deaths.json")])
        assert not (tmp_path / "deaths.json").exists()
