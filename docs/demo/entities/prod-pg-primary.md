---
id: prod-pg-primary
kind: deployment
name: PostgreSQL primary
description: Accepts order transactions and streams changes to its replica.
technology: PostgreSQL 16 · Operator-managed
parent: data-node
owner: Platform team
tags:
  - 1 primary
  - "Logical: database"
relationships:
  - id: pg-replication
    target: prod-pg-replica
    label: Streams write-ahead logs
    protocol: PostgreSQL replication / TLS
    description: The replica replays the primary write-ahead log stream.
    payload: []
  - id: pg-primary-volume
    target: prod-volumes
    label: Persists primary data
    protocol: PVC / CSI volume
    description: The primary owns a dedicated persistent volume; it does not share a
      data directory with the replica.
    payload: []
  - id: primary-backup
    target: prod-backups
    label: Archives base backups and WAL
    protocol: S3 API / HTTPS
    description: Operator-managed backup jobs archive database data to off-cluster
      object storage.
    payload: []
---

# PostgreSQL primary

The primary instance hosts Commerce Database (`database`) tables and the event outbox. A PostgreSQL operator manages role changes and failover. Backup jobs archive base backups and WAL to the off-cluster object store shown in the production overview.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
