# The knowledge base

Every number, mechanic and piece of advice in the game comes from a record here, kept apart from the code, so a guide or a doctor can review and change it without a programmer ([../../spec.md](../../spec.md) → Realism and accuracy principles, [../conventions.md](../conventions.md) → Data, not literals).

The records are the JSON files in `content/facts/`, one file per area, and `content/facts.schema.json` is their format. `uv run pytest tests/test_check_facts_script.py` checks them all, and CI runs it with the rest, so a record without a source or a check date can't be merged. `uv run python scripts/check_facts.py` runs the same check and lists what's wrong, by file and record. The page hands the rules their numbers from the records through `KnowledgeBase` (`src/content/knowledge-base.ts`): `number(id)` is a coefficient's value, or the middle of its range, and a fact's middle across its sources; `range(id)` is the lowest and the highest of them, which a coefficient's fit test holds it within. A new file is also named in `KNOWLEDGE_FILES` (`src/content/knowledge-files.ts`), since the room server can't find files by a pattern; `npm test` fails until it is.

## A fact

What the sources say. One version when they agree, one for each when they disagree: the game shows the range across them, and the model uses its middle.

```json
{
  "id": "route.camp-2-altitude",
  "kind": "fact",
  "claim": "Camp 2 stands at this altitude.",
  "status": "source only",
  "versions": [
    {
      "value": 6400,
      "unit": "m",
      "source": { "title": "The first source", "url": "https://example.com/first" },
      "checked": "2026-11-01"
    },
    {
      "range": { "min": 6450, "max": 6500 },
      "unit": "m",
      "source": { "title": "The second source", "url": "https://example.com/second" },
      "checked": "2026-11-01"
    }
  ]
}
```

- **`id`:** the area, a dot, and a short name, in lowercase with hyphens. Other records and the game refer to it, and it's used once across all the files: never reuse or rename one.
- **`claim`:** what the record says, in a sentence, in English. The game's own RU and EN texts live elsewhere.
- **`status`:** `source only`, or `expert-reviewed` once an expert has reviewed the record. The game tells the player which.
- **`value` or `range`, with `unit`:** a version has one or the other. All of a record's numbers share one unit: convert them to it.
- **`note`:** what the source says in words, where its version differs without a number.
- **`estimate`:** `true` where the source estimates the number instead of giving one that's listed or measured, as with the prices of Nepalese operators, who mostly publish none; left out otherwise. Only a version with a number has one. The experts' lists mark it, and the game should too wherever it shows the number.
- **`source`:** its title and link. Rank sources as the spec's source priority does.
- **`checked`:** the day someone read the source and found this in it, `YYYY-MM-DD`. Change it each time you read it again.

A claim with no number (a symptom, a piece of advice) has versions with only `source` and `checked`, and a `note` where sources differ.

## A coefficient

A number the model is tuned with that no source states, such as a fatigue rate. It names the facts it was fitted to and the date of the fit; the balance check holds it to them. A number a source does state is a fact, even when the model uses it.

```json
{
  "id": "body.fatigue-rate",
  "kind": "coefficient",
  "claim": "How fast a climber tires at a steady pace, per hour.",
  "status": "source only",
  "value": 0.2,
  "unit": "1/h",
  "fitted_to": ["time.summit-hour-survivors"],
  "fitted": "2026-11-01"
}
```

Numbers in these examples are made up, and only show the form. Every id in `fitted_to` has to be a fact in the knowledge base. A coefficient has a `value` or a `range`, as a fact's version does, and a unit: `1` where it has none.

## A question

What no source answers, for an expert, in the file of its area. It has no status: it stays open until an expert answers it, and the answer becomes a fact or a coefficient in its place. `about`, if it's there, names the records it asks about, and each one has to exist.

```json
{
  "id": "oxygen.bottle-swap",
  "kind": "question",
  "question": "How is a bottle swapped on the move above 8,000 m?",
  "about": ["oxygen.usual-flow"]
}
```

## A death

The chronicle ([../../spec.md](../../spec.md) → Real accidents as training scenarios) is one record per recorded death, in `content/facts/deaths.json`: who they were, and what each source says of the death. Facts and a source only; nothing else about a real person goes in. The example is made up.

```json
{
  "id": "deaths.1990-05-11-a-climber",
  "kind": "death",
  "name": "A. Climber",
  "citizenship": "Nowhere",
  "hired": false,
  "status": "source only",
  "versions": [
    {
      "date": "1990-05-11",
      "place": "South Summit",
      "altitude": 8750,
      "cause": "exposure",
      "phase": "descent",
      "note": "Caught by the storm on the way down.",
      "source": {
        "title": "The Himalayan Database, Autumn-Winter 2025: 1990 expedition EVER90101, member 3",
        "url": "https://www.himalayandatabase.com/"
      },
      "checked": "2026-11-01"
    }
  ]
}
```

- **`id`:** `deaths.`, the date, and the name, as `deaths.1990-05-11-a-climber`: the earliest date its sources give, as precise as they give it (`deaths.1990-a-climber` for a year alone). Two of one name on one day are `-2`, `-3`. Once written, an id stays, even when a later source gives another date: the accidents name their dead by it.
- **`name`, `citizenship`:** as the source gives them; **`hired`:** `true` for a Sherpa, a porter or a high-altitude worker on the expedition's payroll.
- **A version** says what one source says, and only that: `date`, `place`, `altitude` in metres, `cause`, `phase`, and a `note` for what the words add, with the `source` and `checked` of a fact's version. The `date` is as precise as the source gives it: the day, the month (`1990-05`) or the year (`1990`). Between them, the versions have to give the date and the cause, and the place wherever a source names one. One version when the sources agree; where they disagree, on the date or the cause, one for each: the game shows both.
- **`cause`** is one of the Himalayan Database's classes: `altitude-sickness`, `exhaustion`, `exposure` (with frostbite), `fall`, `crevasse`, `icefall-collapse`, `avalanche`, `falling-rock-or-ice`, `disappearance`, `illness` (not of altitude), `other`, `unknown`. What a source says beyond the class (HAPE, a heart attack) goes in the `note`.
- **`phase`** is where on the climb, in the database's classes too: `approach` (on the way to base camp), `base-camp`, `route-preparation` (fixing the route and carrying loads up it, the Sherpas' work), `ascent` and `descent` (on a summit bid, up or down), `evacuation` (as the expedition leaves the mountain), `other`. Leave it out when no source says.

The Himalayan Database's version of each death comes from its own tables, by `scripts/himalayan_deaths.py`: download the database (its site → Downloads, free), then `uv run python scripts/himalayan_deaths.py <the zip> --edition "Autumn-Winter 2025"`, the update as the downloads page names it, and `--checked` for the day it was read when not today. Each of Everest's dead in its members table becomes a record, its source naming the member (`1990 expedition EVER90101, member 3`): that is how a later run finds the record again. Run on a later update, it writes the database's versions afresh and keeps every other source's version and every other record; a reviewed death the database now tells otherwise goes back to `source only`. `--columns` lists what its tables hold.

The real files' test holds the chronicle to the totals: as many deaths dated through 2025 as the fact `deaths.recorded-through-2025` says, and in spring 2026 as `deaths.recorded-spring-2026`, two facts in the same file, between the lowest and the highest of their versions. A death is dated by the earliest date its sources give. A record missed, or one too many, fails CI.

## An accident

The accidents the game tells in full, one record each in `content/facts/accidents.json`: the dates, the weather, the crowd, the chain of decisions and conditions that led to the deaths, and who died. The game plays the situation, not the people: the names appear only through the `deaths` ids, in the History card.

```json
{
  "id": "accidents.1990-storm",
  "kind": "accident",
  "title": "The storm of 10–11 May 1990",
  "status": "source only",
  "date": "1990-05-10",
  "until": "1990-05-11",
  "weather": {
    "what": "A storm came in during the afternoon.",
    "versions": [{ "note": "From 15:00.", "source": { "title": "…", "url": "https://example.com/a" }, "checked": "2026-11-01" }]
  },
  "crowd": {
    "what": "Three teams on the summit ridge at once.",
    "versions": [{ "value": 30, "unit": "climbers", "source": { "title": "…", "url": "https://example.com/a" }, "checked": "2026-11-01" }]
  },
  "chain": [
    {
      "when": "10 May, 14:00",
      "what": "The turnaround time passes with climbers still below the summit.",
      "versions": [
        { "note": "14:00, agreed the night before.", "source": { "title": "…", "url": "https://example.com/a" }, "checked": "2026-11-01" },
        { "note": "13:00.", "source": { "title": "…", "url": "https://example.com/b" }, "checked": "2026-11-01" }
      ]
    }
  ],
  "deaths": ["deaths.1990-05-11-a-climber"],
  "lesson": "The turnaround time is not up for discussion.",
  "scenario": "A storm on the ridge"
}
```

- **`id`:** `accidents.`, the year and what it was, as `accidents.1990-storm`.
- **`date`** is the day it began, **`until`** the day it ended, when not the same.
- **`weather`, `crowd` and each step of the `chain`** are a statement: `what` happened or held, in a sentence, and `versions`, one per source, as a fact's: a `value` or `range` with its `unit` where there's a number, a `note` for the words. Where sources disagree, one version each, and the game shows both. A step has `when` where a source gives the time, in words; the chain is in order.
- **`deaths`:** the ids of its dead, each a death record. **`lesson`** and **`scenario`** are the spec's table's columns for it.

## The experts' lists

`uv run python scripts/expert_questions.py` prints, as Markdown, what the mountain guide (technique) and the doctor (physiology) are to check, by area. That's every question, and every other record still `source only`, with its sources and check dates: a fact's or a coefficient's numbers, a death's date, place and cause by source, an accident's weather, crowd, chain and lesson. Add `guide` or `doctor` for one list only. The lists are built from the records each time, so they aren't checked in. `ExpertList.EXPERTS` in the script says which experts review each area, and the tests fail on a record in an area nobody reviews: a new area names its experts there. The chronicle, `deaths` and `accidents`, is the guide's.

## The medical library

The game's medicine rests on a fixed library of open sources, each read in full: altitude illness, the body at altitude, cold injuries, the eyes and the first-aid kit. `content/library.json` lists them, each with its link, its edition's year, what it's for and the day it was read; `content/library.schema.json` is its format. Every record in the library's `areas` (now `medicine`) cites only the library, and every source there is cited by a record. `uv run pytest` fails CI on both (`tests/test_check_library_script.py`), and `uv run python scripts/check_library.py` lists what's wrong. A version's title names the section it read, after an arrow: `CDC Yellow Book 2026: High-Altitude Travel and Altitude Illness → Acclimatization`. Its link is the library's, which is what ties it to the library.

How the sources rank, where they differ:

1. **Current guidance:** the CDC Yellow Book 2026 and the WMS 2024 guideline, through the WMS's summary and Omidi et al.'s review. Treatment and medicines follow these.
2. **The 2018 Lake Louise score:** the model of a climber's acute mountain sickness. Its authors call it a research tool, so the game never presents it as a way to diagnose.
3. **The UIAA Medical Commission's recommendations (2008–2024) and the Medex booklet (2008):** symptoms, what to do on the spot, the kit in the cold, and the cases training is built from. Where they differ from the current guidance, the record keeps their version and the game follows the guidance.
4. **Wikipedia, Death zone:** background only, never a source for a treatment.

A source joins the library once someone has read all of it: they add it to `content/library.json` with the day they read it, and add records from it in the same change.

## What goes in

- **Never a dose.** Medicines are described by why doctors use them: no amounts, in a value, a claim or a note. The check refuses a number in mg, µg, g, mL or IU, alone or per something (mg/kg), and such a unit.
- **The real dead.** Facts and a source only.
- **No invented numbers.** What no source gives and no fit supports stays out of the data, and goes in a question for an expert.
- **`expert-reviewed`** is set by the expert's review, never by an edit that only touches up a record.
