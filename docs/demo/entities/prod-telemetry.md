---
id: prod-telemetry
kind: deployment
name: Metrics and logs
description: Collects workload metrics and centralizes application logs.
technology: Prometheus · Grafana · Loki
parent: runtime
owner: Platform team
tags:
  - platform namespace
relationships:
  - id: metrics-app
    target: prod-app
    label: Scrapes workload metrics
    protocol: HTTP /metrics
    description: Prometheus discovers application metric endpoints using Kubernetes labels.
    payload: []
  - id: metrics-data
    target: data-node
    label: Scrapes database and broker metrics
    protocol: HTTP /metrics
    description: Exporters publish PostgreSQL and RabbitMQ operational metrics for
      dashboards and alerts.
    payload: []
  - id: telemetry-tcp-probe
    target: prod-rmq-service
    label: Checks broker port reachability
    protocol: TCP :5671
    description: A blackbox TCP probe checks port reachability only; it does not
      publish or consume events.
    communication:
      protocol: tcp
      mode: direct
    payload: []
---

# Metrics and logs

Prometheus scrapes Pod/exporter endpoints. Grafana displays dashboards and Loki stores logs collected by node agents. This is an overview of the observability stack; its individual Pods, volumes, and external alert receivers are omitted.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.


A blackbox TCP probe checks RabbitMQ port reachability. This is a direct TCP health check, separate from the AMQP message path.
