---
id: data-node
kind: deployment
name: commerce-data namespace
description: Groups PostgreSQL and RabbitMQ Pods with durable storage.
technology: Kubernetes Namespace
parent: runtime
owner: Platform team
tags:
  - Stateful services
relationships: []
---

# commerce-data namespace

Expand this namespace for the primary/replica database, broker replicas, Services, and persistent volumes. PostgreSQL and RabbitMQ are the production instances of the logical Commerce Database (`database`) and Order Events (`events`) containers. The example assumes operator-managed PostgreSQL failover and a RabbitMQ quorum queue; replicas alone do not define a backup strategy.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
