---
id: repository
kind: component
name: Order Repository
description: Loads and saves orders within database transactions.
parent: api
technology: Go · pgx
owner: Commerce team
relationships:
  - id: repository-db
    target: database
    label: Persists orders and outbox entries
    protocol: PostgreSQL / TLS
    description: Uses a single database transaction for aggregate and outbox writes.
    payload: []
---

# Order Repository

Loads and saves orders within database transactions.

## Responsibilities

Loads and saves orders within database transactions.

## Operational notes

This is an illustrative model, not a description of your application. Technology: **Go · pgx**. Maintained by the **Commerce team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
