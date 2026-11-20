---
id: edge
kind: deployment
name: Public load balancer
description: Terminates public TLS and forwards traffic to Kubernetes ingress.
technology: L7 load balancer · TLS
parent: commerce
owner: Platform team
tags:
  - Public entry
relationships:
  - id: edge-runtime
    target: runtime
    label: Forwards application traffic
    protocol: HTTPS / private network
    description: The load balancer forwards requests to the ingress controller in
      the production Kubernetes cluster.
    payload: []
  - id: edge-ingress
    target: prod-ingress
    label: Forwards encrypted ingress traffic
    protocol: HTTPS / private network
    description: The public load balancer forwards customer requests to the ingress
      controller.
    payload: []
  - id: edge-ingress-websocket
    target: prod-ingress
    label: Forwards live update sessions
    protocol: WSS / TLS
    description: The load balancer preserves the upgraded session toward ingress.
    communication:
      protocol: websocket
      mode: direct
    payload: []
---

# Public load balancer

The public entry point is `shop.orbit.example`. TLS is terminated here and re-encrypted to the ingress controller. Health checks remove unhealthy ingress backends. No database or broker port is publicly exposed.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
