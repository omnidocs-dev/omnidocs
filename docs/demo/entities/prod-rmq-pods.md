---
id: prod-rmq-pods
kind: deployment
name: RabbitMQ Pods ×3
description: Replicates durable order queues across three broker Pods.
technology: StatefulSet · RabbitMQ quorum
parent: data-node
owner: Platform team
tags:
  - 3 replicas
  - "Logical: events"
relationships:
  - id: rmq-volumes
    target: prod-volumes
    label: Persists broker logs
    protocol: PVC / CSI volumes
    description: Each broker Pod has a separate persistent volume for its queue log.
    payload: []
  - id: brokers-workers
    target: prod-worker-pods
    label: Delivers order events
    protocol: AMQP / TLS :5671
    description: Fulfillment consumers receive queued order events and acknowledge
      successful processing.
    payload: []
    communication:
      protocol: amqp
      mode: brokered
---

# RabbitMQ Pods ×3

Three broker Pods implement the logical Order Events (`events`) container. Quorum queues replicate durable messages across the broker members. StatefulSet identity and per-Pod volume claims keep storage assignments stable; topology rules spread Pods across workers.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
