# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Undecided for the product (the codebase was reset on 13 Nov 2026). Design mocks under `.impeccable/` are plain static HTML/CSS.

## Users

- **Primary: a founder with an idea**, using their own installed copy of Athar. They type an idea in Arabic, French or English and want to know whether it was already tried in Tunisia, what happened, and what to test before committing.
- **Operator:** the same install's owner, collecting, cleaning and preparing the registry data in the operator portal.
- **Portfolio visitors** (recruiters, clients) judge the product from screenshots of real use on a landing page; they are not the user the app screens are designed for.

## Product Purpose

Athar (أثر, "trace") is a memory of Tunisian startups where every fact links to its source. Knowledge about Tunisian startups is scattered and companies vanish without a trace, so founders repeat attempts without knowing it. Success: a founder sees prior attempts, and their sources, before committing.

## Positioning

Every fact on screen opens the registry row it came from. AI is native, not forced: it finds related startups and explains similarities and differences, always with sources; if the AI could be removed without the user noticing, it is forced.

## Operating Context

- Open source, self-hosted, installed from the repository; not a SaaS, no sign-up, no billing.
- Bring your own AI key. With no key the app still works without AI.
- All data and vectors live in one local SQLite file.
- One web app with two areas: the main app (search, profiles, idea check, themes and white space, 2-3 landscape charts) and the operator portal (keys, runs, macro and micro trace, database view).

## Capabilities and Constraints

- Source: the Startup Tunisia registry, about 923 startups. Fields per startup: name, description, sector, website, founders, cohort (label date MM/YYYY), creation year. Nothing else exists; never show fields the data does not have.
- Idea check: matches come from embeddings of the description plus the sector. Similarities and differences are AI sentences generated only from a match's description and sector. "No match" is a real, designed result, said explicitly. A saved idea check keeps the idea, its matches and their sources.
- Website check: reachable or unreachable since a date, an observation, never a verdict about the company.
- Not a success score, not a social network. Compare 2-5, chat on a profile and generated custom views are cut.

## Brand Commitments

- Name Athar, mark in `assets/athar.svg` and `assets/athar-dark.svg` (three stacked tiles with an ochre thread).
- Fonts, the Qallaline base colours and the 60-30-10 rule in `docs/DESIGN.md` are fixed by the owner.
- Athar is the owner's flagship portfolio product; their site oussemajaouadi.vercel.app is the taste reference they trust.

## Evidence on Hand

- No real registry data in the repo after the reset. Mocks use clearly fake startups, labelled as example data.
- No testimonials, users, metrics or press; none may be invented.

## Product Principles

1. Every claim leads to its source.
2. Get more out of thin data; never pretend the data is richer than it is.
3. AI earns its place or is removed.
4. Say "nothing found" plainly; absence is a result.
5. Works without AI.
