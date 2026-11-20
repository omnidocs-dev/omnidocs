---
id: payment-adapter
kind: component
name: Payment Adapter
description: Maps payment operations to the external provider API.
parent: api
technology: Go · HTTP client
owner: Commerce team
relationships:
  - id: adapter-gateway
    target: payments
    label: Authorizes payment
    protocol: HTTPS / JSON
    description: Translates provider errors and preserves the idempotency key.
    payload: []
---

# Payment Adapter

Maps payment operations to the external provider API.

## Responsibilities

Maps payment operations to the external provider API.

## Operational notes

This is an illustrative model, not a description of your application. Technology: **Go · HTTP client**. Maintained by the **Commerce team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
