---
id: prod-control
kind: deployment
name: Control plane
description: Schedules Pods and reconciles the desired Kubernetes state.
technology: API server · Scheduler · Controllers
parent: runtime
owner: Platform team
tags:
  - Management plane
relationships:
  - id: control-workers
    target: prod-workers
    label: Schedules and reconciles Pods
    protocol: Kubernetes API / TLS
    description: The scheduler assigns Pods to worker nodes and controllers maintain
      the declared workload state.
    payload: []
---

# Control plane

A managed, highly available control plane provides the API server, scheduler, controllers, and etcd state store. Application HTTP traffic is not routed through the control plane. Platform administration uses authenticated access to the Kubernetes API.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
