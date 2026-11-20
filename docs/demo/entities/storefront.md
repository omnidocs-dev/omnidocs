---
id: storefront
kind: container
name: Web Storefront
description: Product browsing, shopping cart, and checkout experience.
parent: commerce
technology: React · TypeScript
owner: Experience team
relationships:
  - id: web-api
    target: api
    label: Submits checkout requests
    protocol: HTTPS / JSON
    description: Sends a validated checkout request to the application API.
    payload:
      - cartId
      - customerId
      - shippingAddress
      - idempotencyKey
    communication:
      protocol: rest
      mode: direct
code:
  - repository: orbit-frontend
    path: src
    kind: directory
---

# Web Storefront

Product browsing, shopping cart, and checkout experience.

## Responsibilities

Product browsing, shopping cart, and checkout experience.

## Operational notes

This is an illustrative model, not a description of your application. Technology: **React · TypeScript**. Maintained by the **Experience team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
