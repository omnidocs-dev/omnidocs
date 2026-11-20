---
id: prod-clients
kind: deployment
name: Customer browsers
description: Public HTTPS access to the storefront and checkout API.
technology: Browser · Internet
parent: commerce
owner: Platform team
tags:
  - Public network
relationships:
  - id: clients-edge
    target: edge
    label: Requests storefront and checkout
    protocol: HTTPS / TLS 1.3
    description: The browser resolves shop.orbit.example and sends HTTPS requests to
      the public load balancer.
    payload: []
  - id: clients-edge-websocket
    target: edge
    label: Opens live order updates
    protocol: WSS / TLS :443
    description: The browser opens the optional /live order-status channel.
    communication:
      protocol: websocket
      mode: direct
    payload:
      - orderId
      - status
---

# Customer browsers

Browsers load the React storefront and call `/api` on the same public hostname. Traffic enters through the public TLS load balancer.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
