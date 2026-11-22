---
id: production-cluster
kind: view
name: Cluster internals
type: deployment
scope: runtime
nodes:
  - prod-control
  - prod-workers
  - prod-ingress
  - prod-app
  - data-node
  - prod-telemetry
description: "Inside the production Kubernetes cluster: control plane, compute,
  ingress, namespaces, and monitoring."
parentView: production
direction: RIGHT
---

# Cluster internals

The worker pool hosts the Pods belonging to commerce-app and commerce-data. Namespace boundaries group resources logically. Ingress routes to application Services; application Pods reach database and broker Services. The control plane schedules and reconciles workloads and is not in the application request path.

See the production overview for external load balancing, provider egress, and off-cluster backup storage.
