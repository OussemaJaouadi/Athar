# Athar

An open-source project for exploring Tunisian startups through traceable source data.
Source: <https://github.com/OussemaJaouadi/Athar>.

- **Available now:** a local DataOps terminal app for the Startup Tunisia registry.
- Collect records, preserve original evidence, and flag uncertain data for review.
- Search records, inspect source JSON, browse database tables, and follow collection logs.
- The web app and AI-assisted research are not available yet.

## Run

From the repository root, with [uv](https://docs.astral.sh/uv/) installed:

```sh
uv run --project dataops athar-dataops
```

- Python 3.13+; uv manages the environment and dependencies.
- Choose **Collect registry** to fetch data. No model credentials are needed.
- [DataOps setup and keyboard shortcuts](dataops/README.md)
- [Changelog](CHANGELOG.md)
- [ISC license](LICENSE)
