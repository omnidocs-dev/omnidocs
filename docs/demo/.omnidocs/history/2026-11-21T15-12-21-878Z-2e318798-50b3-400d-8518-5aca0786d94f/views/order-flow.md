---
id: order-flow
name: Order checkout
type: dataflow
scope: commerce
nodes:
  - storefront
  - api
  - payments
  - database
  - events
  - worker
  - notifications
relationships:
  - web-api
  - api-pay
  - api-db
  - api-queue
  - queue-worker
  - worker-email
description: Follow a checkout request from the storefront to payment and fulfillment.
kind: view
---

# Order checkout

Follow a checkout request from the storefront to payment and fulfillment.

All elements and relationships in this diagram reference the shared Markdown model.
