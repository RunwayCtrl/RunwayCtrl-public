-- Phase 1 (Ledger + Schema): durable system-of-record
-- v0.1 stance: store hashes/pointers/metadata only (no raw tool payloads).

create table if not exists tenants (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  api_key_id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  label text,
  -- Store hash only (argon2id hash string); never store plaintext.
  key_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, label)
);

create table if not exists actions (
  tenant_id text not null references tenants(id) on delete cascade,
  action_key text not null,
  tool text not null,
  action text not null,
  resource_key text,
  -- Hashes/pointers (no raw payloads)
  request_hash text not null,
  outcome_hash text,
  outcome_pointer text,
  created_at timestamptz not null default now(),
  -- Phase 4+: dedupe/replay policy
  dedupe_expires_at timestamptz,
  -- Terminalization (Phase 3/4+)
  terminal_status text,
  terminal_failure_class text,
  terminal_at timestamptz,
  -- Cheap hot-path hints (optional now, used later)
  attempt_count int not null default 0,
  last_attempt_status text,
  last_attempt_ended_at timestamptz,
  primary key (tenant_id, action_key),
  constraint actions_terminal_status_check check (terminal_status in ('SUCCESS', 'FAILURE') or terminal_status is null)
);

create index if not exists idx_actions_tenant_action_key on actions (tenant_id, action_key);
create index if not exists idx_actions_tenant_resource_key on actions (tenant_id, resource_key);

create table if not exists attempts (
  tenant_id text not null references tenants(id) on delete cascade,
  attempt_id text not null,
  action_key text not null,
  status text not null default 'IN_FLIGHT',
  failure_class text,
  -- Hashes/pointers (no raw payloads)
  request_hash text not null,
  outcome_hash text,
  outcome_pointer text,
  trace_id text,
  tool_http_status int,
  latency_ms int,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (tenant_id, attempt_id),
  constraint attempts_status_check check (status in ('IN_FLIGHT', 'SUCCESS', 'FAILURE', 'UNKNOWN')),
  constraint attempts_ended_at_check check (
    (status = 'IN_FLIGHT' and ended_at is null) or
    (status <> 'IN_FLIGHT' and ended_at is not null)
  ),
  constraint attempts_action_fk foreign key (tenant_id, action_key)
    references actions (tenant_id, action_key) on delete cascade
);

create index if not exists idx_attempts_tenant_action_key_started_at on attempts (tenant_id, action_key, started_at desc);

create table if not exists attempt_events (
  tenant_id text not null references tenants(id) on delete cascade,
  attempt_id text not null,
  event_id bigserial primary key,
  ts timestamptz not null default now(),
  event_type text not null,
  -- Only safe metadata; never store raw tool payloads here.
  details jsonb not null default '{}'::jsonb,
  constraint attempt_events_attempt_fk foreign key (tenant_id, attempt_id)
    references attempts (tenant_id, attempt_id) on delete cascade
);

-- Ordering is always by (ts, event_id)
create index if not exists idx_attempt_events_tenant_attempt_ts on attempt_events (tenant_id, attempt_id, ts, event_id);

create table if not exists leases (
  tenant_id text not null references tenants(id) on delete cascade,
  resource_key text not null,
  holder_id text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (tenant_id, resource_key),
  constraint leases_expires_after_acquired check (expires_at > acquired_at)
);

create index if not exists idx_leases_tenant_resource_expires on leases (tenant_id, resource_key, expires_at);
