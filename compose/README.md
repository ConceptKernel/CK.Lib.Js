# compose/ — local dev env for `ck-lib-js.localhost`

Canonical bring-up for the CK.Lib.Js local dev/verification route. Stands up an
**isolated** all-in-one (its own NATS + Postgres) behind the shared local TLS Envoy
at `https://ck-lib-js.localhost`, so the stripped [`ck-client.js`](../ck-client.js) +
the local verify harness can be exercised against a real NATS-over-WSS + governed
Postgres.

Local-dev only — not part of the published client surface.

Files:

- [`docker-compose.yml`](docker-compose.yml) — the `ck-lib-js-allinone` service (latest
  `ociger-ck-allinone`, ports 57290–57293, isolated PG-data volume, first-wake env bundle).
- [`envoy/ck-lib-js.routes.yaml`](envoy/ck-lib-js.routes.yaml) — the three manual Envoy
  blocks (vhost / filter_chain / clusters), merge-ready into the shared
  `29-localhost-tls-envoy/envoy.yaml`. Tagged `manual; not ck-generated`.

Routing contract: `/` → web (200) · `/wss` → NATS WSS (101).

Endpoints/ports (host → container): `57290→8000` web · `57291→9222` NATS WSS ·
`57292→4222` NATS TCP · `57293→5432` Postgres.

## Latest image

`docker-compose.yml` defaults to `ociger-ck-allinone:v0.7.8-local` (the freshest local
build at authoring, baking pgCK 0.3.3+/0.3.4). Point at your latest with:

```bash
CK_ALLINONE_IMAGE=ociger-ck-allinone:<your-latest> docker compose up -d
# (check `docker images | grep ociger-ck-allinone` for the newest tag)
```

First wake on a **fresh** volume brings up the pgCK role floor + the `ckp.dispatch`
SECURITY-DEFINER door and sets `ck_participant`'s password from
`OCIGER_CK_PARTICIPANT_PASSWORD`. It does **not** create a kernel board — do that in
step 5 below.

## Bring-up (runbook steps 1–7, condensed)

### 1. Start the container

```bash
cd compose
docker compose up -d
docker compose ps          # ck-lib-js-allinone → running, ports 57290–57293
```

### 2. Issue the cert (mkcert, no sudo)

Into the shared Envoy's `certs/`:

```bash
cd 29-localhost-tls-envoy/certs
mkcert ck-lib-js.localhost "*.ck-lib-js.localhost"
mv ck-lib-js.localhost+1.pem      ck-lib-js.localhost.pem
mv ck-lib-js.localhost+1-key.pem  ck-lib-js.localhost-key.pem
```

### 3. Merge the Envoy routes + validate/restart (no sudo)

Hand-merge the three blocks from [`envoy/ck-lib-js.routes.yaml`](envoy/ck-lib-js.routes.yaml)
into the shared `29-localhost-tls-envoy/envoy.yaml` (vhost before `catchall`, filter_chain
into the listener, clusters appended). Then:

```bash
cd 29-localhost-tls-envoy
envoy --mode validate -c envoy.yaml                       # → configuration 'envoy.yaml' OK
pkill -f 'envoy -c.*envoy.yaml'
nohup envoy -c envoy.yaml --log-level warn > logs/envoy.log 2>&1 &
```

### 4. DNS for the browser (one-time, **needs sudo**)

`curl`/Envoy work without this via `--resolve`; a browser needs it. The dnsmasq wildcard
(`address=/ck-lib-js.localhost/127.0.0.1`) is already in `/opt/homebrew/etc/dnsmasq.conf`:

```bash
echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/ck-lib-js.localhost
sudo brew services start dnsmasq        # starts dnsmasq machine-wide
```

### 5. First-boot bootstrap (first time only)

The image brings up the floor + dispatch door but **not** a board, and `/ontology` is not
mounted — bootstrap the board and load the ontology modules from the pgCK repo:

```bash
export PGPASSWORD=pgcklocal
psql -h 127.0.0.1 -p 57293 -U postgres -d postgres -c \
  "SET ckp.project='cklibjs-smoke'; CALL ckp.bootstrap_kernel();"
cd ~/git_conceptkernel/pgCK
psql -h 127.0.0.1 -p 57293 -U postgres -d postgres <<'SQL'
\set tk `cat ontology/task.ttl`
\set gl `cat ontology/goal.ttl`
SELECT pgrdf.add_graph('urn:ckp:cklibjs-smoke/kernel/board') AS board_g \gset
SELECT pgrdf.parse_turtle(:'tk', :board_g, 'urn:ckp:cklibjs-smoke/module/task#');
SELECT pgrdf.parse_turtle(:'gl', :board_g, 'urn:ckp:cklibjs-smoke/module/goal#');
SELECT pgrdf.materialize(:board_g);
SQL
```

### 6. Run the dev outbox→NATS drain (caveat bridge)

The current all-in-one line's in-container native drain does **not** publish — `ckp.outbox`
rows accumulate but never reach NATS. Run pgCK's sanctioned dev bridge alongside the
container (host-side, scoped to these ports only). Browser CKClients connect/subscribe fine
without it (WSS = 101), but won't receive DB-sealed events until it runs:

```bash
PGHOST=127.0.0.1 PGPORT=57293 PGUSER=postgres PGPASSWORD=pgcklocal PGDATABASE=postgres \
  NATS_URL=nats://127.0.0.1:57292 \
  bash ~/git_conceptkernel/pgCK/scripts/dev-outbox-drain.sh
```

### 7. Verify

```bash
# routing (DNS-independent)
curl -sk --resolve ck-lib-js.localhost:443:127.0.0.1 -o /dev/null -w "%{http_code}\n" https://ck-lib-js.localhost/      # 200
curl -sk --resolve ck-lib-js.localhost:443:127.0.0.1 -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  -o /dev/null -w "%{http_code}\n" https://ck-lib-js.localhost/wss                                                      # 101

# NATS↔DB round-trip over the WebSocket transport (drain from step 6 must be running)
nats --server ws://127.0.0.1:57291 sub 'event.kernel.pgCK.>' &
psql -h 127.0.0.1 -p 57293 -U postgres -d postgres -c \
  "SET ckp.project='cklibjs-smoke'; SELECT ckp.seal('CHK', '{\"type\":\"https://conceptkernel.org/ontology/v3.7/Goal\",\"https://conceptkernel.org/ontology/v3.7/goal_id\":\"chk\",\"https://conceptkernel.org/ontology/v3.7/title\":\"t\",\"https://conceptkernel.org/ontology/v3.7/created_at\":\"2026-06-10T00:00:00Z\"}'::jsonb);"
# → subscriber receives event.kernel.pgCK.Goal.sealed
```

## What this serves

This route is the live target for the v1.5.0 alpha verification:

- The stripped [`ck-client.js`](../ck-client.js) — `CKClient` connect → JWT login →
  floored `ckp.dispatch` verb — against this isolated pgCK.
- The local browser harness (index.html + harness.js) — point its `?wss=` at
  `wss://ck-lib-js.localhost/wss`.

## Teardown

```bash
cd compose
docker compose down                # keeps the PG volume
docker compose down -v             # also drops ck-lib-js-pgdata (fresh first-wake next time)
```
