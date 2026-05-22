---
name: dataset-creator
description: >
  Create and manage machine learning datasets on HuggingFace Hub through Claude Code.
  Use this skill whenever the user wants to create, populate, extend, validate, or manage
  any HuggingFace dataset — including chat/conversational, classification, Q&A, completion,
  tabular, and custom dataset formats. Also trigger when the user says "create a dataset",
  "add examples to my dataset", "push to HuggingFace", "build training data", or any
  request involving HuggingFace Hub dataset workflows. Requires HF_TOKEN env var and
  the huggingface_hub Python package.
compatibility: Requires Python, huggingface_hub package, and HF_TOKEN environment variable.
---

# HuggingFace Dataset Creator

Create, populate, and manage ML datasets on HuggingFace Hub. Supports all major dataset
formats used in LLM and ML workflows.

## Setup (one-time)

```bash
# 1. Install HuggingFace MCP server (for dataset discovery)
claude mcp add hf-mcp-server -t http https://huggingface.co/mcp?login

# 2. Set your HuggingFace token (get from https://huggingface.co/settings/tokens)
export HF_TOKEN="hf_..."

# 3. Install the Python client
uv add huggingface_hub
# or: pip install huggingface_hub
```

## Dataset Types

| Type | Use Case | Key Fields |
|------|----------|------------|
| `chat` | Conversational AI, assistants, tool use | messages (role/content list) |
| `classification` | Sentiment, intent, topic tagging | text, label |
| `qa` | Question answering, reading comprehension | question, context, answer |
| `completion` | Text/code completion, creative writing | prompt, completion |
| `tabular` | Structured ML data | feature columns, target |
| `custom` | Your own schema | any fields you define |

## Core Workflow

### 1. Create a new dataset

```python
from huggingface_hub import HfApi
import os

api = HfApi(token=os.environ["HF_TOKEN"])

# Create repo
api.create_repo(
    repo_id="username/dataset-name",
    repo_type="dataset",
    private=True  # set False for public
)
```

### 2. Add examples

Structure data according to the dataset type, then push:

```python
import datasets

# Build the dataset
ds = datasets.Dataset.from_list(examples)

# Push to Hub
ds.push_to_hub("username/dataset-name", token=os.environ["HF_TOKEN"])
```

### 3. Extend existing dataset

```python
# Load existing
existing = datasets.load_dataset("username/dataset-name", split="train")

# Append new examples
new_examples = [...]
combined = datasets.concatenate_datasets([existing, datasets.Dataset.from_list(new_examples)])
combined.push_to_hub("username/dataset-name")
```

### 4. Validate dataset quality

Before pushing, verify:
- [ ] No empty required fields
- [ ] Labels are consistent strings/ints across rows
- [ ] No duplicate rows (for deduplication: `ds.unique("text")`)
- [ ] Schema matches expected format
- [ ] Sample a few rows to eyeball quality

```python
# Quick validation
print(ds.features)       # schema
print(ds[0])             # first example
print(len(ds))           # count
print(ds.to_pandas().isnull().sum())  # missing values
```

## Example Prompts That Trigger This Skill

```
"Create a sentiment classification dataset at myuser/sentiment-data"
"Add 50 Q&A examples about Python to claude-ai/python-qa-dataset"
"Build a chat dataset for training a customer service bot"
"Show me stats for myuser/my-dataset"
"Push my training examples to HuggingFace"
```

## Common Pitfalls

- **Token missing** → `export HF_TOKEN="hf_..."` before running
- **Repo already exists** → use `exist_ok=True` in `create_repo()`
- **Schema mismatch on extend** → cast features to match before concatenating
- **Private dataset** → ensure token has write access to the org/user namespace

## Links

- [HuggingFace Hub docs](https://huggingface.co/docs/huggingface_hub)
- [Datasets library](https://huggingface.co/docs/datasets)
- [HuggingFace MCP Server](https://huggingface.co/mcp)
- [Token settings](https://huggingface.co/settings/tokens)
