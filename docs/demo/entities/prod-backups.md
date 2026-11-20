---
id: prod-backups
kind: deployment
name: Off-cluster backups
description: Encrypted PostgreSQL backups and WAL archives outside the cluster.
technology: S3-compatible object storage
parent: commerce
owner: Platform team
tags:
  - Backup storage
relationships: []
---

# Off-cluster backups

A scheduled backup job uploads daily PostgreSQL base backups and continuous write-ahead log (WAL) archives. This example retains backups for 30 days and assumes periodic restore drills. The object store is outside the Kubernetes failure boundary; the diagram does not claim measured recovery objectives.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
