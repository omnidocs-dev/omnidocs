---
id: backoffice
kind: container
name: Operations Console
description: A workspace for managing products, inventory, and orders.
parent: commerce
technology: React · TypeScript
owner: Operations team
relationships:
  - id: admin-api
    target: api
    label: Manages catalog and orders
    protocol: HTTPS / JSON
    description: Authorized store operators update inventory and review orders.
    payload: []
    communication:
      protocol: rest
      mode: direct
code:
  - repository: orbit-frontend
    path: src/backoffice
    kind: directory
---

# Operations Console

A workspace for managing products, inventory, and orders.

## Responsibilities

A workspace for managing products, inventory, and orders.

## Operational notes

This is an illustrative model, not a description of your application. Technology: **React · TypeScript**. Maintained by the **Operations team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
