---
id: prod-volumes
kind: deployment
name: Persistent volumes
description: Stores separate database and broker data on durable volumes.
technology: PVC · CSI · Block storage
parent: data-node
owner: Platform team
tags:
  - Separate volume per Pod
relationships: []
---

# Persistent volumes

Each PostgreSQL instance and each RabbitMQ Pod requests its own PersistentVolumeClaim (PVC), backed by a Container Storage Interface (CSI) driver. PersistentVolume resources are cluster-scoped; they are grouped here with namespaced claims for readability. This box aggregates distinct volumes; it is not one shared database filesystem. Volume storage is provisioned by the storage backend rather than the container writable layer.

[Persistent volume concepts](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
