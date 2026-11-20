---
id: commerce
kind: system
name: Commerce Platform
description: The home for product discovery, checkout, and order fulfillment.
owner: Commerce team
tags:
  - Core system
  - In scope
relationships:
  - id: commerce-payments
    target: payments
    label: Charges and refunds purchases
    description: Delegates payment processing to an external payment provider.
    payload: []
  - id: commerce-email
    target: notifications
    label: Sends order updates
    description: Requests transactional email delivery after order state changes.
    payload: []
code:
  - repository: orbit-backend
    path: .
    kind: directory
  - repository: orbit-frontend
    path: .
    kind: directory
---

# Commerce Platform

The home for product discovery, checkout, and order fulfillment.

## Responsibilities

Owns the customer purchase journey from catalog browsing to fulfillment. Payment processing and email delivery are delegated to external systems.

## Operational notes

This is an illustrative model, not a description of your application. Maintained by the **Commerce team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
