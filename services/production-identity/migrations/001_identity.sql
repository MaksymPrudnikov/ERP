CREATE TABLE IF NOT EXISTS identity_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE SEQUENCE IF NOT EXISTS identity_line_base AS bigint MINVALUE 1 NO CYCLE;
CREATE TABLE IF NOT EXISTS identity_lines (
  id uuid PRIMARY KEY, origin_line_key text NOT NULL UNIQUE,
  base bigint NOT NULL DEFAULT nextval('identity_line_base') UNIQUE CHECK (base > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identity_counters (
  line_id uuid NOT NULL REFERENCES identity_lines(id), kind text NOT NULL CHECK (kind IN ('G','U')),
  next_instance bigint NOT NULL DEFAULT 1 CHECK (next_instance > 0), PRIMARY KEY (line_id, kind)
);
CREATE TABLE IF NOT EXISTS identity_requests (
  request_id text PRIMARY KEY, operation text NOT NULL, fingerprint text NOT NULL,
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identity_gateways (
  gateway_id text PRIMARY KEY, active_incarnation uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identity_incarnations (
  id uuid PRIMARY KEY, gateway_id text NOT NULL REFERENCES identity_gateways(gateway_id),
  state text NOT NULL CHECK (state IN ('active','retired')), next_event_sequence bigint NOT NULL CHECK (next_event_sequence > 0),
  registered_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identity_reservations (
  id uuid PRIMARY KEY, line_id uuid NOT NULL REFERENCES identity_lines(id), kind text NOT NULL CHECK (kind IN ('G','U')),
  gateway_id text NOT NULL REFERENCES identity_gateways(gateway_id), incarnation_id uuid NOT NULL REFERENCES identity_incarnations(id),
  range_start bigint NOT NULL CHECK (range_start > 0), range_end bigint NOT NULL CHECK (range_end >= range_start),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (line_id, kind, range_start)
);
CREATE TABLE IF NOT EXISTS identity_entities (
  id uuid PRIMARY KEY, line_id uuid NOT NULL REFERENCES identity_lines(id), kind text NOT NULL CHECK (kind IN ('G','U')),
  code text NOT NULL UNIQUE, instance bigint CHECK (instance > 0), replaces_id uuid REFERENCES identity_entities(id),
  current_line_key text NOT NULL, slot jsonb, component_key text,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','broken','cancelled')), legacy boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL, UNIQUE (line_id, kind, instance)
);
CREATE TABLE IF NOT EXISTS identity_registry (
  code text PRIMARY KEY, entity_id uuid NOT NULL REFERENCES identity_entities(id), is_alias boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS identity_composition (
  unit_id uuid NOT NULL REFERENCES identity_entities(id), glass_id uuid NOT NULL REFERENCES identity_entities(id),
  assembled_at timestamptz NOT NULL, PRIMARY KEY (unit_id, glass_id)
);
CREATE TABLE IF NOT EXISTS identity_jobs (
  id text PRIMARY KEY, gateway_id text NOT NULL REFERENCES identity_gateways(gateway_id),
  line_id uuid NOT NULL REFERENCES identity_lines(id), kind text NOT NULL CHECK (kind IN ('G','U')),
  count integer NOT NULL CHECK (count > 0), reserve_count integer CHECK (reserve_count > 0),
  payload jsonb NOT NULL, released boolean NOT NULL DEFAULT true, released_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS identity_events (
  id uuid PRIMARY KEY, gateway_id text NOT NULL REFERENCES identity_gateways(gateway_id),
  incarnation_id uuid NOT NULL REFERENCES identity_incarnations(id), sequence bigint NOT NULL CHECK (sequence > 0),
  type text NOT NULL, payload jsonb NOT NULL, fingerprint text NOT NULL, occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(), UNIQUE (incarnation_id, sequence)
);
CREATE INDEX IF NOT EXISTS identity_entities_replaces ON identity_entities(replaces_id);
CREATE INDEX IF NOT EXISTS identity_events_object ON identity_events ((payload->>'entityId'));
CREATE INDEX IF NOT EXISTS identity_reservations_gateway ON identity_reservations(gateway_id, incarnation_id);
INSERT INTO identity_migrations(version) VALUES ('001_identity') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS identity_workspaces(gateway_id text PRIMARY KEY REFERENCES identity_gateways(gateway_id),revision bigint NOT NULL,data jsonb NOT NULL);
