---
id: prod-rmq-service
kind: deployment
name: RabbitMQ Service
description: Provides a stable AMQPS endpoint for producers and consumers.
technology: Service · ClusterIP :5671
parent: data-node
owner: Platform team
tags:
  - Network abstraction
relationships:
  - id: svc-rmq-pods
    target: prod-rmq-pods
    label: Selects ready broker Pods
    protocol: AMQP / TLS :5671
    description: The Service exposes ready members of the RabbitMQ cluster.
    payload: []
    communication:
      protocol: amqp
      mode: brokered
---

# RabbitMQ Service

Application Pods connect to `rabbitmq.commerce-data.svc:5671`. The Service exposes broker endpoints, while queue replication is handled by RabbitMQ itself.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
