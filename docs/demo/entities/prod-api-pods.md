---
id: prod-api-pods
kind: deployment
name: Backend API Pods ×3
description: Executes checkout logic and publishes committed order events.
technology: Deployment · Go · HPA 3–8
parent: prod-app
owner: Platform team
tags:
  - 3 desired replicas
  - "Logical: api"
relationships:
  - id: pods-pg
    target: prod-pg-service
    label: Persists checkout transactions
    protocol: PostgreSQL / TLS :5432
    description: API Pods write the order and outbox through the writable database Service.
    payload: []
  - id: pods-rmq
    target: prod-rmq-service
    label: Publishes committed order events
    protocol: AMQP / TLS :5671
    description: The outbox dispatcher publishes committed events through the broker
      Service.
    payload: []
    communication:
      protocol: amqp
      mode: brokered
  - id: pods-payments
    target: payments
    label: Authorizes customer payments
    protocol: HTTPS / JSON
    description: API Pods call the external payment provider through controlled egress.
    payload: []
    communication:
      protocol: rest
      mode: direct
---

# Backend API Pods ×3

These are production instances of the logical Backend API (`api`). The example Deployment starts with three Pods; the HPA may adjust the replica count from 3 to 8. Readiness, liveness, resource requests, and limits are assumed. API Pods connect to PostgreSQL and RabbitMQ in commerce-data and send payment requests through cluster egress.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.


## Additional example endpoints

This fictional API also exposes an internal order-status gRPC endpoint on port 9090 and an optional `/live` WebSocket endpoint on port 8080. These channels illustrate distinct protocol paths; they are not measurements of a deployed service.
