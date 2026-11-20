---
id: api
kind: container
name: Backend API
description: Coordinates checkout, payments, inventory, and order state.
parent: commerce
technology: Go · HTTP
owner: Commerce team
tags:
  - Core service
relationships:
  - id: api-db
    target: database
    label: Reads and persists order state
    protocol: PostgreSQL / TLS
    description: Transactions persist the order and its payment state.
    payload:
      - orderId
      - status
      - totalAmount
      - paymentReference
  - id: api-pay
    target: payments
    label: Authorizes payment
    protocol: HTTPS / JSON
    description: Requests payment authorization using a provider token.
    payload:
      - orderId
      - amount
      - currency
      - paymentToken
    communication:
      protocol: rest
      mode: direct
  - id: api-queue
    target: events
    label: Publishes order events
    protocol: AMQP / TLS
    description: An outbox dispatcher publishes committed order events.
    payload:
      - eventId
      - orderId
      - eventType
      - occurredAt
    communication:
      protocol: amqp
      mode: brokered
code:
  - repository: orbit-backend
    path: internal
    kind: directory
---

# Backend API

Coordinates checkout, payments, inventory, and order state.

## Responsibilities

Accepts authenticated requests, applies application rules, persists state, and publishes committed domain events.

## Operational notes

This is an illustrative model, not a description of your application. Technology: **Go · HTTP**. Maintained by the **Commerce team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
