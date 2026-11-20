---
id: prod-pg-replica
kind: deployment
name: PostgreSQL replica
description: Replays the primary WAL stream on a separate worker.
technology: PostgreSQL 16 · Streaming replica
parent: data-node
owner: Platform team
tags:
  - 1 standby
relationships:
  - id: pg-replica-volume
    target: prod-volumes
    label: Persists replica data
    protocol: PVC / CSI volume
    description: The replica uses its own volume, separate from the primary volume.
    payload: []
---

# PostgreSQL replica

One streaming replica runs on another worker node with its own data volume. The sample uses asynchronous replication; lag is possible. Operator-driven promotion, backup retention, and restore drills are separate responsibilities.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
