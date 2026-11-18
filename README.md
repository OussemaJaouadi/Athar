# Athar

An open-source project for exploring Tunisian startups through traceable source data.
Source: <https://github.com/OussemaJaouadi/Athar>.

## Run

Requires [Bun](https://bun.com) 1.4. On macOS, install a full SQLite build first (`brew install sqlite`),
because Apple's system SQLite cannot load the sqlite-vec extension.

```sh
bun install
bun run dev      # http://localhost:3000
bun run build && bun run start
```

Data lives in one local SQLite file, `data/athar.db` (override with `ATHAR_DB_PATH`).

## Fill it

Open the operator portal and press **Run everything** on Status. It collects the registry, builds the startups, checks every website and embeds the descriptions, in that order, then brings the derived readings up to date. The website check takes about five minutes. It leaves out **Prepare**, which needs an AI key; run that step on its own if you want it. Each step can also be run alone.

## Operator passphrase

The portal runs the pipeline and holds the owner's answers and notes. With `ATHAR_OPERATOR_PASSPHRASE` set, choosing the operator role asks for that passphrase, and changing it signs everyone out. It is one shared passphrase, not accounts. Without it, the sign-in page lets anyone choose the operator role, so anyone who can open the install can run the portal.

- [Data](docs/DATA.md)
- [Design system](docs/DESIGN.md)
- [ISC license](LICENSE)
