---
id: events
kind: queue
name: Order Events
description: Buffers order lifecycle events for asynchronous consumers.
parent: commerce
technology: RabbitMQ
owner: Platform team
relationships:
  - id: queue-worker
    target: worker
    label: Delivers order events
    protocol: AMQP / TLS
    description: The fulfillment worker acknowledges events after processing.
    payload:
      - eventId
      - orderId
      - eventType
    communication:
      protocol: amqp
      mode: brokered
---

# Order Events

Buffers order lifecycle events for asynchronous consumers.

## Responsibilities

Buffers order lifecycle events for asynchronous consumers.

## Operational notes

This is an illustrative model, not a description of your application. Technology: **RabbitMQ**. Maintained by the **Platform team**.

## Related information

Select a relationship to inspect its direction, protocol, and documented payload. Switch views to explore the same application from another perspective.
