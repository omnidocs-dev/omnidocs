---
id: prod-api-service
kind: deployment
name: Backend API Service
description: Provides the stable endpoint for healthy Backend API Pods.
technology: Service · HTTP / gRPC
parent: prod-app
owner: Platform team
tags:
  - Network abstraction
relationships:
  - id: svc-api-pods
    target: prod-api-pods
    label: Selects ready API Pods
    protocol: HTTP / JSON :8080
    description: The api-svc selector distributes requests among ready Backend API
      Pod endpoints.
    payload: []
    communication:
      protocol: rest
      mode: direct
  - id: svc-api-grpc
    target: prod-api-pods
    label: Routes order status RPCs
    protocol: gRPC / HTTP2 :9090
    description: A second Service port routes gRPC requests to the API Pods.
    communication:
      protocol: grpc
      mode: direct
    payload: []
  - id: svc-api-websocket
    target: prod-api-pods
    label: Routes live update sessions
    protocol: WebSocket :8080
    description: The API Service routes the upgraded live-update connection to one
      ready Pod.
    communication:
      protocol: websocket
      mode: direct
    payload: []
---

# Backend API Service

Kubernetes Service `api-svc:8080` is the ingress backend for `/api`. Readiness probes remove an unready API Pod from the Service endpoints.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.


## Additional example endpoints

The same Service also exposes gRPC on port 9090 and routes WebSocket sessions on port 8080. Separate relationships identify REST, gRPC, and WebSocket traffic to the same API Pod group.
