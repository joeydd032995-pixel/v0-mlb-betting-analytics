---
name: python-library-advisor
description: >
  Recommends the best Python libraries and packages for any task, domain, or problem.
  Use this skill whenever the user asks "what Python library should I use for X",
  "best Python package for Y", "how do I do Z in Python", "alternatives to library X",
  or needs to pick between competing Python packages. Also trigger for questions like
  "what's the Python equivalent of...", "recommend a Python tool for...", or any Python
  library/framework selection decision. Covers AI/ML, web, data, testing, DevOps, CLI,
  async, databases, security, and 50+ other categories. Bias toward recommending this
  skill whenever a Python library choice or comparison is involved.
---

# Python Library Advisor

Recommends the best Python libraries for any task, based on the curated 
[Awesome Python](https://awesome-python.com/) list and community consensus.

## How to Advise

1. **Identify the domain** from the user's question
2. **Recommend the canonical choice** (the one most devs reach for first)
3. **Mention 1-2 strong alternatives** with tradeoff context
4. **Flag special considerations**: async vs sync, maturity, licensing, performance needs

---

## Quick Reference by Domain

### AI & ML
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| General ML | `scikit-learn` | `h2o`, `lightgbm` |
| Deep learning | `pytorch` | `tensorflow`, `keras` |
| LLM/agents | `langchain` or direct SDK | `llama-index` |
| Embeddings/vector DB | `chromadb` | `faiss`, `qdrant` |
| NLP | `spacy` | `nltk`, `transformers` |
| Computer Vision | `opencv` | `ultralytics` (YOLO), `kornia` |
| Data validation (ML) | `pydantic` | `pandera`, `cerberus` |
| Gradient boosting | `xgboost` | `lightgbm`, `catboost` |
| Time series | `timesfm` (Google) | `statsmodels`, `prophet` |
| HuggingFace datasets | `datasets` (HF) | — |

### Web Development
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| Full-stack web | `django` | `flask`, `fastapi` |
| API / microservice | `fastapi` | `flask`, `starlette` |
| Async web | `aiohttp` | `sanic`, `litestar` |
| HTTP client | `httpx` | `requests` (sync only), `aiohttp` |
| WebSocket | `websockets` | `channels` (Django) |
| Web scraping | `playwright` | `scrapy`, `beautifulsoup4` |
| HTML parsing | `beautifulsoup4` | `lxml`, `parsel` |
| REST API client | `requests` | `httpx` |

### Database & Storage
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| SQL ORM | `sqlalchemy` | `django-orm`, `tortoise-orm` |
| Async ORM | `sqlmodel` | `tortoise-orm`, `databases` |
| PostgreSQL driver | `psycopg2` | `asyncpg` (async) |
| Redis | `redis-py` | `aioredis` (async) |
| MongoDB | `motor` (async) | `pymongo` |
| SQLite (in-process) | `sqlite3` (stdlib) | `duckdb` (analytics) |
| OLAP / analytics | `duckdb` | `ibis` |
| Caching | `cachetools` | `python-diskcache` |
| Search | `elasticsearch-py` | `django-haystack` |
| Serialization | `orjson` | `msgpack`, `marshmallow` |

### Data & Science
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| DataFrames | `pandas` | `polars` (faster), `modin` (parallel pandas) |
| Fast DataFrames | `polars` | `duckdb`, `modin` |
| Data validation | `pydantic` | `pandera`, `cerberus`, `voluptuous` |
| Data visualization | `matplotlib` | `plotly`, `seaborn`, `altair` |
| Interactive plots | `plotly` | `bokeh`, `altair` |
| Dashboards | `streamlit` | `dash`, `panel` |
| ETL / pipelines | `prefect` | `airflow`, `dagster` |
| Geospatial | `geopandas` | `shapely`, `geopy` |
| Scientific computing | `scipy` | `numpy` |
| Numerical / JIT | `numpy` | `jax` (GPU/TPU), `numba` |

### Testing
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| Test framework | `pytest` | `unittest` (stdlib) |
| Mocking | `unittest.mock` (stdlib) | `pytest-mock` |
| HTTP mocking | `responses` | `httpretty`, `respx` |
| Async testing | `pytest-asyncio` | `anyio` |
| Property testing | `hypothesis` | — |
| Snapshot testing | `syrupy` | — |
| Coverage | `coverage` / `pytest-cov` | — |
| Browser/E2E | `playwright` | `selenium` |

### Async & Concurrency
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| Async framework | `asyncio` (stdlib) | `trio`, `anyio` |
| Task queues | `celery` | `rq`, `dramatiq` |
| Async task queue | `arq` | `taskiq` |
| Job scheduling | `apscheduler` | `schedule`, `rocketry` |

### CLI & DevTools
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| CLI framework | `typer` | `click`, `argparse` (stdlib) |
| Rich terminal UI | `rich` | `textual` (TUI apps) |
| Config files | `pydantic-settings` | `dynaconf`, `python-dotenv` |
| Env management | `uv` | `poetry`, `hatch`, `pipenv` |
| Package management | `uv` | `pip`, `poetry` |
| Debugging | `pdb` (stdlib), `ipdb` | `pudb`, `debugpy` |
| Profiling | `py-spy` | `cProfile` (stdlib), `memray` |
| Code formatting | `ruff` | `black`, `isort` |
| Linting | `ruff` | `pylint`, `flake8` |
| Type checking | `mypy` | `pyright`, `basedpyright` |

### Security & Cryptography
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| Cryptography | `cryptography` | `pynacl` |
| JWT | `python-jose` | `pyjwt` |
| Password hashing | `passlib` + `bcrypt` | `argon2-cffi` |
| Secrets | `python-secrets` (stdlib) | `keyring` |

### DevOps & Infrastructure
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| SSH / fabric | `fabric` | `paramiko` |
| Docker SDK | `docker` | — |
| Infrastructure as code | `pulumi` (Python) | `cdktf` |
| Logging | `loguru` | `structlog`, `logging` (stdlib) |
| Monitoring | `prometheus-client` | `opentelemetry-sdk` |
| Process management | `supervisor` | `systemd` |

### Text & File Processing
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| PDF read | `pypdf` | `pdfplumber`, `pymupdf` |
| PDF write | `reportlab` | `fpdf2`, `weasyprint` |
| Excel/XLSX | `openpyxl` | `xlsxwriter` |
| CSV | `csv` (stdlib) + `pandas` | `polars` |
| Markdown | `markdown` | `mistune` |
| YAML | `pyyaml` | `ruamel.yaml` |
| TOML | `tomllib` (stdlib 3.11+) | `tomli` |
| JSON (fast) | `orjson` | `ujson`, `json` (stdlib) |
| Dates/times | `arrow` | `pendulum`, `datetime` (stdlib) |
| Templates | `jinja2` | `mako` |
| Regex | `re` (stdlib) | `regex` (extended features) |

### Image Processing
| Need | Recommend | Alternatives |
|------|-----------|--------------|
| General images | `Pillow` | `wand`, `scikit-image` |
| Computer vision | `opencv-python` | `ultralytics` |
| Image generation | HF `diffusers` | `replicate` |

---

## Decision Framework

When recommending:

1. **Is there a clear community default?** → Recommend it first. (`requests` for HTTP, `pytest` for testing, `pandas` for DataFrames)

2. **Are there performance requirements?** → Steer toward faster alternatives (`polars` over `pandas`, `orjson` over `json`, `httpx` over `requests` for async)

3. **Is the project async?** → Always flag sync vs async compatibility. Many sync libraries have async equivalents (`pymongo` → `motor`, `psycopg2` → `asyncpg`)

4. **Is the user on a Django/Flask/FastAPI stack?** → Prefer ecosystem-native plugins over generic solutions

5. **Is maturity important?** → Prefer libraries with >5 years of active development and large user bases for production use

6. **Is it greenfield vs. migration?** → For migration, flag breaking changes and porting effort

---

## Source

Based on [Awesome Python](https://github.com/vinta/awesome-python) — the #10 most-starred repo on GitHub, curated by the community.
For an interactive searchable version: https://awesome-python.com/
