---
id: prod-workers
kind: deployment
name: Worker pool ×3
description: Runs application and stateful Pods across three failure zones.
technology: kubelet · containerd · CNI
parent: runtime
owner: Platform team
tags:
  - 3 nodes
  - Zones A / B / C
relationships:
  - id: workers-app
    target: prod-app
    label: Runs application Pods
    protocol: Pod scheduling / containerd
    description: The worker pool hosts storefront, API, and fulfillment Pods
      belonging to commerce-app.
    payload: []
  - id: workers-data
    target: data-node
    label: Runs stateful Pods
    protocol: Pod scheduling / containerd
    description: The same worker pool hosts data Pods with placement rules and
      persistent-volume attachment.
    payload: []
---

# Worker pool ×3

Three worker nodes, one per example zone, run kubelet, containerd, and the cluster network interface (CNI). Topology spread and anti-affinity distribute replicas across nodes. Namespace boundaries in this diagram are logical groups; a namespace is not assigned to one physical node.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
