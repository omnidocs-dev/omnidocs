---
id: production-data
kind: view
name: Stateful services
type: deployment
scope: data-node
nodes:
  - prod-pg-service
  - prod-pg-primary
  - prod-pg-replica
  - prod-rmq-service
  - prod-rmq-pods
  - prod-volumes
description: PostgreSQL replication, RabbitMQ quorum brokers, Services, and
  persistent volumes in commerce-data.
parentView: production-cluster
direction: RIGHT
---

# Stateful services

PostgreSQL uses an operator-managed writable primary and one streaming standby. RabbitMQ uses three broker Pods and quorum queues. The persistent-volume box aggregates independent claims for the two database instances and three brokers; it is not a shared writable data directory. Off-cluster database backup storage appears in the production overview.
