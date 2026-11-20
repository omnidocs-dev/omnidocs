---
id: orders
kind: component
name: Order Service
description: Applies order rules and coordinates payment and persistence.
parent: api
technology: Go · Application service
owner: Commerce team
relationships:
  - id: orders-payment
    target: payment-adapter
    label: Requests authorization
    protocol: Go interface
    description: Uses the payment port without depending on provider-specific details.
    payload: []
  - id: orders-repository
    target: repository
    label: Saves order and outbox event
    protocol: Go interface
    description: Atomically persists order state and an event outbox entry.
    payload: []
code:
  - repository: orbit-backend
    path: internal/application/orders/service.go
    kind: file
    symbol: orders.Service.Place
    lines:
      start: 32
      end: 96
---

# Order Service

Applies order rules and coordinates payment and persistence.

## Responsibilities

Coordinates a checkout as a single application operation. Keeps business decisions separate from HTTP and payment-provider details.

## Operational notes

This is an illustrative model, not a description of your application. Technology: **Go · Application service**. Maintained by the **Commerce team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
