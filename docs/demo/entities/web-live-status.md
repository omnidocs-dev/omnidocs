---
id: web-live-status
kind: component
name: Order Status Stream
description: Subscribes to live order updates and updates the checkout screen.
parent: storefront
technology: TypeScript · WebSocket
code:
  - repository: orbit-frontend
    path: src/features/orders/useOrderStatus.ts
    kind: file
    symbol: useOrderStatus
    lines:
      start: 8
      end: 61
relationships:
  - id: stream-backend-api
    target: api
    label: Subscribes to live order updates
    protocol: WebSocket / WSS
    communication:
      protocol: websocket
      mode: direct
---

# Order Status Stream

A Frontend hook for the optional live order-update connection. It does not share a file or repository path with the Backend implementation.

## Mapping status

This is a fictional code mapping for the example workspace. Paths, symbols, line ranges, and repository refs illustrate the input format; they have not been checked against a real repository.
