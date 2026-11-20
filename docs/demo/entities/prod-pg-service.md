---
id: prod-pg-service
kind: deployment
name: PostgreSQL RW Service
description: Routes database clients to the current writable primary.
technology: Service · ClusterIP :5432
parent: data-node
owner: Platform team
tags:
  - Network abstraction
relationships:
  - id: svc-pg-primary
    target: prod-pg-primary
    label: Selects the current primary
    protocol: PostgreSQL / TLS :5432
    description: An operator updates the writable-primary endpoint when promotion occurs.
    payload: []
---

# PostgreSQL RW Service

The stable endpoint is `postgres-rw.commerce-data.svc:5432`. This sample assumes a PostgreSQL operator manages role labels and failover; a Kubernetes Service by itself does not elect or promote a primary.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
