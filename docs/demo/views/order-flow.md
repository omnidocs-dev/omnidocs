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
  - studio.2ed6a0cc9a52
  - studio.bac453af604e
  - checkout
  - backoffice
  - web-checkout-client
relationships:
  - web-api
  - api-pay
  - api-db
  - api-queue
  - queue-worker
  - worker-email
  - studio.e4a8b1888f4b
description: Follow a checkout request from the storefront to payment and fulfillment.
kind: view
entryPoints:
  - node: backoffice
    label: Start
---

# Order checkout

Follow a checkout request from the storefront to payment and fulfillment.

All elements and relationships in this diagram reference the shared Markdown model.
