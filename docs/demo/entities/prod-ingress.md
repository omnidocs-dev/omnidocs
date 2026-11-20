---
id: prod-ingress
kind: deployment
name: Ingress controller ×2
description: Routes public paths to storefront and API Services.
technology: Traefik · Ingress
parent: runtime
owner: Platform team
tags:
  - 2 Pods
  - platform namespace
relationships:
  - id: ingress-app
    target: prod-app
    label: Routes / and /api to Services
    protocol: HTTP / cluster network
    description: Ingress rules send / to storefront-svc:80 and /api to api-svc:8080
      in commerce-app.
    payload: []
  - id: ingress-api
    target: prod-api-service
    label: Routes /api requests
    protocol: HTTP :8080
    description: The /api ingress backend is api-svc in commerce-app.
    payload: []
    communication:
      protocol: rest
      mode: direct
  - id: ingress-web
    target: prod-web-service
    label: Routes storefront requests
    protocol: HTTP :80
    description: The / ingress backend is storefront-svc in commerce-app.
    payload: []
  - id: ingress-api-websocket
    target: prod-api-service
    label: Routes /live upgrades
    protocol: WebSocket :8080
    description: The /live ingress rule routes upgraded connections to the API Service.
    communication:
      protocol: websocket
      mode: direct
    payload: []
---

# Ingress controller ×2

Two ingress-controller Pods run on separate worker nodes. Rules for `shop.orbit.example` route `/` to `storefront-svc:80` and `/api` to `api-svc:8080`. The public load balancer terminates TLS; this example re-encrypts the private connection to the controller.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.


The optional `/live` rule forwards WebSocket upgrades to the API Service.
