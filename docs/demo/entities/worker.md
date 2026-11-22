---
id: worker
kind: container
name: Fulfillment Worker
description: Consumes order events and coordinates fulfillment updates.
parent: commerce
technology: Go · Background worker
owner: Commerce team
relationships:
  - id: worker-db
    target: database
    label: Updates fulfillment state
    protocol: PostgreSQL / TLS
    description: Persists processing outcomes with idempotent event handling.
    payload: []
  - id: worker-email
    target: notifications
    label: Requests order confirmation
    protocol: HTTPS / JSON
    description: Sends confirmation after a paid order is accepted.
    payload:
      - recipient
      - templateId
      - orderId
    communication:
      protocol: rest
      mode: direct
  - id: studio.e4a8b1888f4b
    target: web-checkout-client
    label: شسیشسی
code:
  - repository: orbit-backend
    path: cmd/worker
    kind: directory
---

# Fulfillment Worker

Consumes order events and coordinates fulfillment updates.

## Responsibilities

Processes committed order events. Retries transient failures and uses event IDs to prevent duplicate fulfillment actions.

## Operational notes

This is an illustrative model, not a description of your application. Technology: **Go · Background worker**. Maintained by the **Commerce team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
