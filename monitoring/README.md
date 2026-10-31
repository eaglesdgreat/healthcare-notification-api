# Notification service monitoring

The notification API integrates with the centralized
`healthcare-observability` stack. This directory does not run a second
Prometheus, Grafana, Loki, or Alertmanager stack.

## Data flow

- **Metrics:** Prometheus scrapes the API at
  `http://host.docker.internal:5502/api/metrics`. The API exposes process,
  request-latency, enqueue, and delivery-outcome metrics. The scrape job is
  configured in `healthcare-observability/infra/prometheus/prometheus.yml`.
- **Logs:** The API's Docker Compose service writes JSON logs. Grafana Alloy in
  the observability stack discovers Docker container logs and forwards them to
  Loki. In Grafana, select Loki and query
  `{service_name="ms-notification-api"} | json`.
- **Traces:** The notification API does not currently initialize the
  observability package's OpenTelemetry SDK or export traces. Its request ID
  is correlation metadata, not a distributed trace ID.

## Run locally

Start the centralized stack first so Prometheus and Loki are available:

```sh
cd ../healthcare-observability
docker compose up -d
```

Then start the notification API and its dependencies:

```sh
cd ../healthcare-notification-api
docker compose up -d --build
```

Check `http://localhost:9090/targets` for the
`healthcare-notification-api` target, or query
`up{job="healthcare-notification-api"}` in Prometheus. The API metrics endpoint
is also available at `http://localhost:5502/api/metrics`.

Stop each stack from its own repository with `docker compose down`. This
preserves named data volumes. Do not expose the metrics endpoint publicly;
restrict access at the host or gateway in shared environments.
