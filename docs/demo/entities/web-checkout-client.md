---
id: web-checkout-client
kind: component
name: Checkout API Client
description: Serializes checkout requests and handles API responses.
parent: storefront
technology: TypeScript · fetch
code:
  - repository: orbit-frontend
    path: src/features/checkout/checkoutClient.ts
    kind: file
    symbol: submitCheckout
    lines:
      start: 10
      end: 46
relationships:
  - id: client-backend-api
    target: api
    label: Posts checkout requests
    protocol: REST / HTTPS / JSON
    communication:
      protocol: rest
      mode: direct
---

# Checkout API Client

The browser-side client is mapped to the Frontend repository. It calls the documented Backend API over REST; the client function and server handler are distinct code locations.

## Mapping status

This is a fictional code mapping for the example workspace. Paths, symbols, line ranges, and repository refs illustrate the input format; they have not been checked against a real repository.
