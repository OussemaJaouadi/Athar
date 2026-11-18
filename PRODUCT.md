# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TanStack Start (React 19) on Bun 1.4, Tailwind 4, one SQLite file with sqlite-vec, charts on TanStack Charts. Components come from shadcn-registry libraries (Interior, Kokonut UI, ReUI) restyled on Athar's tokens. Embeddings are computed on the user's machine (Qwen3-Embedding-0.6B).

## Users

- **Primary: a founder with an idea**, using their own installed copy of Athar. They type an idea in Arabic, French or English and want to know whether it was already tried in Tunisia, what happened, and what to test before committing.
- **Operator:** the same install's owner, keeping the registry data current in the operator portal: running the pipeline steps, reading why Athar says what it says about a startup, answering the questions the rules could not settle, keeping notes with a source, following startups and exporting them with a citation.
- **Analysts** reading the Landscape charts for how the scene changed by year, sector and team size.
- **Portfolio visitors** (recruiters, clients) judge the product from screenshots of real use on a landing page; they are not the user the app screens are designed for.

## Product Purpose

Athar (أثر, "trace") is a memory of Tunisian startups where every fact links to its source. Knowledge about Tunisian startups is scattered and companies vanish without a trace, so founders repeat attempts without knowing it. Success: a founder sees prior attempts, and their sources, before committing.

## Positioning

Every fact on screen opens the registry row it came from. AI is native, not forced: it finds related startups and explains similarities and differences, always with sources; if the AI could be removed without the user noticing, it is forced.

## Operating Context

- Open source, self-hosted, installed from the repository; not a SaaS, no sign-up, no billing.
- Bring your own AI key (OpenRouter, Groq, OpenAI, Anthropic or Google). With no key the app still works: search, profiles and the idea check by meaning need none; a key adds the cleaned text used for matching and the same-and-different sentences on an idea check.
- All data and vectors live in one local SQLite file (`data/athar.db`). The data model is in `docs/DATA.md`.
- One web app with two areas:
  - **The reading room:** Ask (type an idea; the saved checks sit under the form), Archive (search and browse, filtered also by what a website shows today, by founders with another venture and by other names), Landscape (Growth, Fields, Teams), and a page per startup, person, sector, label year and saved idea check.
  - **The operator portal:** Status (the five pipeline steps, their runs, what each download changed, a "Run everything" button and how many readings were settled by a rule, inferred, or wait for the owner), Startups (every startup with the registry entries behind it, filtered by what is missing or doubtful or by the ones followed; notes, follow and export on each startup; a Startups | Review switch to the Review desk), Ideas (what people looked for and where nothing was close; it opens on the saved checks). AI keys and the raw tables are in the account menu.
- The pipeline has five steps: Collect, Build, Check websites, Prepare (optional, needs a key) and Embed. "Run everything" runs all but Prepare. Build, Check websites and Embed each end by deriving **readings**: every other name, standard spelling, tie between startups and website state, with the rule that produced it and the reason. A reading is settled by a rule, inferred (shown with a qualifier) or waits for the owner; the model is in `docs/DATA.md`. Every reading can be rebuilt from the registry; the owner's answers, notes and follows are kept apart and never rebuilt.
- Sign-in has no accounts. When `ATHAR_OPERATOR_PASSPHRASE` is set, the operator role asks for that one shared passphrase; when it is not, a visitor picks the operator role.

## Capabilities and Constraints

- Source: the Startup Tunisia registry, one public request of about 920 rows. Measured on 18 November 2026: 918 distinct entries, 901 startups, 1,918 people (56 on more than one startup).
- Fields per startup: name, description, sector, website, founders, label date (month and year), creation year. Nothing else exists; never show fields the data does not have. No funding, headcount, location, stage or survival.
- The registry gives rows no id and a new order on every request, so an entry is identified by its content. Two entries are one startup when they share a website or a name, by the rule in `docs/DATA.md`.
- Idea check: matches come from embeddings of the description plus the sector. Similarities and differences are AI sentences generated only from a match's description and sector. "Nothing close" is a real, designed result, said explicitly. A saved idea check keeps the idea, its matches and their sources.
- Website check: reachable or unreachable since a date, with the reason in words. An observation, never a verdict about the company. Each answer is also read as one of six states (answers, moved, parked or for sale, a store or social page, silent, unrelated), and the page's own title and one-line description are kept. A visitor sees what the website shows today, and the site's words quoted and attributed, only when it still answers or has moved.
- Other names and other ventures: a startup page lists the other names it goes by (the name its description opens with, its initials, an email domain) and the other ventures of its founders (a renamed startup, a successor, a second venture). Each is said with its qualifier ("likely", "may be", "not confirmed"), with one quiet mark that opens the reason. A tie that rests only on a founder name not confirmed as one person is kept apart and says so.
- The owner answers what the rules could not settle: whether two names are one person, how two startups relate, whether a website that now answers from another address is the same venture. An answer holds until the registry changes the row it rests on, then the question reopens. Notes carry a kind (closed, acquired, renamed, note), a date and a web address as the source, are shown on the startup's page beside the registry's data and never change it. An export (CSV or JSON, all startups or the followed ones) comes with a citation of the registry download.
- Voice: evidence, never a verdict. Athar says what the registry, the website and the owner's sources show, with the qualifier the evidence earns. It does not label a company an agency, and there is no kind of note for that.
- 69 startups have no description, so they cannot be matched by meaning; 24 of them are among the 28 labelled in 2025.
- Two registry rows carry login details in the website field. The stored entry keeps them; every screen withholds them.
- Not a success score, not a social network. Compare 2-5, chat on a profile and generated custom views are cut. A founders-and-circles view (people who start several startups together) is parked until outcome data exists.

## Brand Commitments

- Name Athar, mark in `assets/athar.svg` and `assets/athar-dark.svg` (three stacked tiles with an ochre thread).
- The Qallaline base colours, the 60-30-10 rule and the typefaces in `docs/DESIGN.md` are fixed by the owner: Amiri for titles and record names, Readex Pro for text, Fragment Mono for identifiers.
- Athar is the owner's flagship portfolio product; their site oussemajaouadi.vercel.app is the taste reference they trust.

## Evidence on Hand

- Real registry data, collected locally into `data/athar.db`. The file is not committed; a fresh install collects its own copy from the portal.
- Mocks under `.impeccable/mocks/` predate the data and use clearly fake startups, labelled as example data.
- No testimonials, users, metrics or press; none may be invented.

## Product Principles

1. Every claim leads to its source.
2. Get more out of thin data; never pretend the data is richer than it is.
3. AI earns its place or is removed.
4. Say "nothing found" plainly; absence is a result.
5. Works without AI.
6. Evidence, never a verdict: say what is uncertain in words, and keep the registry's value beside every derived one.
