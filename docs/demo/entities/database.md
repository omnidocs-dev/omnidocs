---
id: database
kind: database
name: Commerce Database
description: Stores products, inventory, orders, and the event outbox.
parent: commerce
technology: PostgreSQL 16
owner: Platform team
tags:
  - Persistent storage
---

# Commerce Database

Stores products, inventory, orders, and the event outbox.

## Responsibilities

Maintains durable business records. Order writes and outbox entries are committed together to keep event publication recoverable.

## Operational notes

This is an illustrative model, not a description of your application. Technology: **PostgreSQL 16**. Maintained by the **Platform team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
