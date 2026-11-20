---
id: prod-worker-pods
kind: deployment
name: Fulfillment Pods ×2
description: Consumes order events and persists fulfillment outcomes.
technology: Deployment · Go worker
parent: prod-app
owner: Platform team
tags:
  - 2 replicas
  - "Logical: worker"
relationships:
  - id: workerpods-pg
    target: prod-pg-service
    label: Persists fulfillment results
    protocol: PostgreSQL / TLS :5432
    description: Worker Pods persist idempotent processing results through postgres-rw.
    payload: []
  - id: workerpods-email
    target: notifications
    label: Requests order confirmations
    protocol: HTTPS / JSON
    description: Worker Pods send confirmation requests through cluster egress.
    payload: []
    communication:
      protocol: rest
      mode: direct
  - id: worker-api-grpc
    target: prod-api-service
    label: Queries current order status
    protocol: gRPC / HTTP2 :9090
    description: An internal unary RPC queries the order status endpoint.
    communication:
      protocol: grpc
      mode: direct
    payload:
      - orderId
---

# Fulfillment Pods ×2

These Pods run the logical Fulfillment Worker (`worker`). Two consumers acknowledge events after successful processing and use event IDs for idempotency. Workers use RabbitMQ and PostgreSQL Services in commerce-data and call the external email provider. There is no inbound public Service for these background workers.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
