# Athar — Data Layer Architecture & Contracts

> Authority document for the shared Turso database (`athar.db`). Both Python DataOps and the Go Backend must strictly comply with the contracts defined here.

---

## 1. Operating Model & Table Ownership

The single local database file contains two completely segregated table domains. Dual-writer tables are strictly prohibited.

```mermaid
flowchart TD
    subgraph DataOps["Python DataOps (Maintainer Ingestion)"]
        DO_WRITE["Product Data Writer<br/>(Acquisition, Normalization, Vectors)"]
    end

    subgraph Backend["Go Backend (User Application)"]
        BE_READ["Product Data Reader<br/>(Search, Aggregations, RAG)"]
        BE_WRITE["Account Data Writer<br/>(Identity, History, Usage)"]
    end

    subgraph DB["One Embedded Turso Database (athar.db)"]
        subgraph ProductGroup["Product Table Group (Exclusive Writer: DataOps)"]
            T_SNAP["source_snapshots"]
            T_ROWS["source_rows"]
            T_ENT["entities"]
            T_FND["entity_founders"]
            T_REV["entity_review_items"]
            T_VEC["entity_embeddings"]
            T_PRP["preparation_usage"]
            T_TXT["text_preparations"]
            T_PRO["profiles"]
            T_QUO["dataops_quotas"]
            T_RUN["pipeline_runs"]
        end

        subgraph AccountGroup["Account Table Group (Exclusive Writer: Go Backend)"]
            T_USR["user_profile"]
            T_HIST["user_history"]
            T_USG["user_usage"]
        end

        subgraph MetaGroup["System Meta"]
            T_MIG["schema_migrations"]
        end
    end

    DO_WRITE -->|exclusive writes| ProductGroup
    BE_READ -.->|read-only| ProductGroup
    BE_WRITE -->|exclusive writes| AccountGroup
    DO_WRITE -->|runs migrations| MetaGroup
    BE_WRITE -.->|validates checksums| MetaGroup

    classDef do fill:#0C447C,stroke:#85B7EB,color:#FFFFFF
    classDef be fill:#145443,stroke:#63D5AF,color:#FFFFFF
    classDef table fill:#1E293B,stroke:#94A3B8,color:#F8FAFC
    class DO_WRITE do
    class BE_READ,BE_WRITE be
    class T_SNAP,T_ROWS,T_ENT,T_FND,T_REV,T_VEC,T_PRP,T_TXT,T_PRO,T_QUO,T_RUN,T_USR,T_HIST,T_USG,T_MIG table
```

### Strict Ownership Rules
* **Product Tables:**
  * **DataOps:** Exclusive writer. Handles fetch, snapshot preservation, normalization, and vector embedding.
  * **Go Backend:** Read-only. Queries entities, runs full-text/vector searches, and aggregates landscape metrics.
* **Account Tables:**
  * **Go Backend:** Exclusive writer. Records local user identity, search history, and inference consumption.
  * **DataOps:** Zero access. DataOps never touches account tables.
* **Public Exports:**
  * Public datasets query product tables explicitly (`SELECT ... FROM entities`).
  * The database file itself is **never** copied directly to public releases.

---

## 2. Product Schema & Relationships (ERD)

All searchable attributes are indexed first-class columns. Duplicate rows are flagged `is_duplicate` on the derived layer and suppressed from default views, never deleted; `source_rows` serves as the sole citation evidence. Staged fields (`retrieval_text`, `detected_language`, `is_embedded`) are pre-allocated and post-filled cleanly: the Prepare operation fills `retrieval_text`/`detected_language` from a one-call language detection, fluff removal, and English translation, keyed to the exact description hash so unchanged input is never reprocessed. Review findings carry a shared `code`/`category` (automatic, incomplete, or human) so storage and UI classify issues identically; only unresolved human items count as "records needing review".

```mermaid
erDiagram
    SOURCE_SNAPSHOTS ||--|{ SOURCE_ROWS : "contains"
    SOURCE_SNAPSHOTS ||--o{ ENTITIES : "first seen in"
    SOURCE_SNAPSHOTS ||--o{ ENTITIES : "latest updated in"
    SOURCE_ROWS ||--o{ ENTITIES : "cites verbatim evidence"
    ENTITIES ||--o{ ENTITY_FOUNDERS : "founded by"
    ENTITIES ||--o{ ENTITY_REVIEW_ITEMS : "flags"
    SOURCE_ROWS ||--o{ ENTITY_REVIEW_ITEMS : "flagged evidence"
    ENTITIES ||--o| ENTITY_EMBEDDINGS : "vectorized into"
    SOURCE_SNAPSHOTS ||--o{ PIPELINE_RUNS : "produced in"
    SOURCE_ROWS ||--o{ TEXT_PREPARATIONS : "prepared once per hashed description"
    ENTITIES ||--o{ TEXT_PREPARATIONS : "canonical output"
    PIPELINE_RUNS ||--o{ PREPARATION_USAGE : "consumed"
    SOURCE_ROWS ||--o{ PREPARATION_USAGE : "attempted per record"

    SOURCE_SNAPSHOTS {
        string id PK
        string source_url
        string content_hash UK
        string fetched_at
        int row_count
    }

    SOURCE_ROWS {
        string id PK
        string snapshot_id FK
        int row_number "audit/display only"
        string raw_json
        int is_duplicate "1 when exact name+website dup"
    }

    ENTITIES {
        string id PK
        string name
        string name_key
        string domain
        string website
        string description
        string sector
        string cohort_label
        string cohort_date
        int creation_year
        string retrieval_text "NULL until LLM fluff removal"
        string detected_language "NULL until LLM language detection"
        int is_embedded "0 until Qwen embeddings generated"
        string status_signal "NULL reserved for R3/R4"
        string first_snapshot_id FK
        string latest_snapshot_id FK
        string latest_row_id FK
        string created_at
        string updated_at
    }

    ENTITY_FOUNDERS {
        string id PK
        string entity_id FK
        string full_name
        string created_at
    }

    ENTITY_REVIEW_ITEMS {
        string id PK
        string entity_id FK
        string source_row_id FK
        string reason
        string code "shared issue code"
        string category "automatic | incomplete | human"
        int resolved
        string created_at
    }

    ENTITY_EMBEDDINGS {
        string entity_id PK, FK
        string model_version
        blob embedding
        string updated_at
    }

    PIPELINE_RUNS {
        string id PK
        string operation "collect | clean | prepare"
        string started_at
        string completed_at
        string snapshot_id FK
        string status
        int records_processed
        int review_count
        string error
    }

    PIPELINE_RUNS ||--|{ RUN_STEPS : "records each"
    RUN_STEPS {
        string run_id PK, FK
        string step_name PK
        string status
        string started_at
        string completed_at
        int items_processed
        string message
    }

    TEXT_PREPARATIONS {
        string cache_key PK
        string source_row_id FK
        string entity_id FK
        string input_hash "sha-256 of the original description"
        string provider "groq"
        string model
        string prompt_version
        string schema_version
        string target_language "en"
        string output_json "detected_language, cleaned_text, english_translation, fluff_excerpts"
        string created_at
    }

    PREPARATION_USAGE {
        string id PK
        string run_id FK
        string source_row_id FK
        string provider
        string model
        string profile
        string key_fingerprint "partial digest; never the key"
        string started_at
        number duration_seconds
        int input_tokens
        int output_tokens
        string request_id
        string outcome "started | completed | failed | cancelled | rate_limited | authentication | transport"
        string error
    }

    PROFILES ||--o{ DATAOPS_QUOTAS : "constrained by"
    PROFILES ||--o{ PREPARATION_USAGE : "accounts for"
    PROFILES {
        string id PK
        string name UK "registry identity; the TOML store is authoritative"
        string provider "groq"
        string model
        string fingerprint "partial digest; never the key"
        int disabled "1 after failed authentication, until operator repairs"
        string created_at
        string updated_at
    }

    DATAOPS_QUOTAS {
        string id PK
        string profile_id FK
        string task "prepare (embeddings later)"
        string metric "records_per_day | tokens_per_day | requests_per_minute | estimate_tokens_per_record"
        number limit_value "0 means unlimited"
        string period "day | minute"
        string created_at
        string updated_at
    }
```

---

## 3. Account Schema & Relationships (ERD)

Local single-user workspace tables isolated from product data.

```mermaid
erDiagram
    USER_PROFILE ||--o{ USER_HISTORY : "performs"
    USER_PROFILE ||--o{ USER_USAGE : "consumes"

    USER_PROFILE {
        string id PK
        string display_name
        string created_at
    }

    USER_HISTORY {
        string id PK
        string user_id FK
        string query_type
        string input_text
        string result_metadata
        string created_at
    }

    USER_USAGE {
        string id PK
        string user_id FK
        string operation
        string model_name
        int prompt_tokens
        int completion_tokens
        int duration_ms
        string recorded_at
    }
```

---

## 4. Database Engine & Concurrency Rules

1. **Embedded SQLite / Turso Pragmas:**
   * `PRAGMA foreign_keys = ON;` (enforce relational integrity on every connection).
   * `PRAGMA journal_mode = WAL;` (non-blocking reads while DataOps writes).
   * `PRAGMA busy_timeout = 5000;` (queue instead of throwing busy errors).
2. **Connection Lifecycles:**
   * DataOps writes are batch-scoped (`BEGIN IMMEDIATE`), keeping write locks minimal.
   * Go Backend product reads execute as read-only queries.

---

## 5. Migration Discipline

* **Shared Migration Files:** Idempotent, numbered `.sql` files in `migrations/`.
* **Checksum Verification:** Both Python and Go compute SHA-256 hashes of applied migrations; mismatch halts startup immediately.
