---
id: runtime
kind: deployment
name: Production Kubernetes
description: Runs the commerce workloads and stateful services in Kubernetes.
technology: Kubernetes · Production
parent: commerce
owner: Platform team
tags:
  - Kubernetes cluster
  - 3 worker nodes
relationships:
  - id: runtime-payments
    target: payments
    label: Sends payment authorizations
    protocol: HTTPS / JSON
    description: Backend API Pods make outbound payment requests through controlled
      cluster egress.
    payload: []
  - id: runtime-notifications
    target: notifications
    label: Sends order confirmations
    protocol: HTTPS / JSON
    description: Fulfillment Worker Pods call the email provider after processing
      committed order events.
    payload: []
  - id: runtime-backup
    target: prod-backups
    label: Archives database backups
    protocol: S3 API / HTTPS
    description: A database backup job uploads encrypted base backups and
      write-ahead logs to object storage outside the cluster.
    payload: []
---

# Production Kubernetes

## Cluster layout

Expand this box to see ingress, the control plane, the worker pool, application/data namespaces, and monitoring.

| Boundary | Purpose |
| --- | --- |
| commerce-app | Storefront, Backend API, and Fulfillment Worker Pods |
| commerce-data | PostgreSQL, RabbitMQ, and volume claims |
| platform | Ingress, DNS, metrics, and logging |

Three worker nodes span three failure zones. The control plane manages scheduling and reconciliation; it is outside the customer request path.

## Reading the diagram

Namespace boxes group Kubernetes resources logically. They are not physical servers. The worker-pool hosting arrows show where the namespaces' Pods execute. Root-level payment, email, and backup arrows aggregate traffic originating from those Pods.

## References

- [Kubernetes cluster architecture](https://kubernetes.io/docs/concepts/architecture/)
- [C4 deployment diagrams](https://c4model.com/diagrams/deployment)

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
