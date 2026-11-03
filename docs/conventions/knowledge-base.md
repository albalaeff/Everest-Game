# The knowledge base

Every number, mechanic and piece of advice in the game comes from a record here, kept apart from the code, so a guide or a doctor can review and change it without a programmer ([../../spec.md](../../spec.md) → Realism and accuracy principles, [../conventions.md](../conventions.md) → Data, not literals).

The records are the JSON files in `content/facts/`, one file per area, and `content/facts.schema.json` is their format. `uv run pytest tests/test_check_facts_script.py` checks them all, and CI runs it with the rest, so a record without a source or a check date can't be merged. `uv run python scripts/check_facts.py` runs the same check and lists what's wrong, by file and record. The page hands the rules their numbers from the records through `KnowledgeBase` (`src/page/knowledge-base.ts`): `number(id)` is a coefficient's value, or the middle of its range, and a fact's middle across its sources.

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

## The experts' lists

`uv run python scripts/expert_questions.py` prints, as Markdown, what the mountain guide (technique) and the doctor (physiology) are to check, by area. That's every question, and every fact and coefficient still `source only`, with its values, sources and check dates. Add `guide` or `doctor` for one list only. The lists are built from the records each time, so they aren't checked in. `ExpertList.EXPERTS` in the script says which experts review each area, and the tests fail on a record in an area nobody reviews: a new area names its experts there.

## What goes in

- **Never a dose.** Medicines are described by why doctors use them: no amounts, in a value, a claim or a note. The check refuses a number in mg, µg, g, mL or IU, alone or per something (mg/kg), and such a unit.
- **The real dead.** Facts and a source only.
- **No invented numbers.** What no source gives and no fit supports stays out of the data, and goes in a question for an expert.
- **`expert-reviewed`** is set by the expert's review, never by an edit that only touches up a record.
