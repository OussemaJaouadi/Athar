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
bun test
```

Data lives in one local SQLite file, `data/athar.db` (override with `ATHAR_DB_PATH`).

- [Data](docs/DATA.md)
- [Design system](docs/DESIGN.md)
- [ISC license](LICENSE)
