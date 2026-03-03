export type ActionRow = {
  tenant_id: string;
  action_key: string;
  tool: string;
  action: string;
  resource_key: string | null;
  request_hash: string;
  created_at: Date;
};

export type AttemptRow = {
  tenant_id: string;
  attempt_id: string;
  action_key: string;
  status: 'IN_FLIGHT' | 'SUCCESS' | 'FAILURE' | 'UNKNOWN';
  request_hash: string;
  started_at: Date;
  ended_at: Date | null;
  failure_class: string | null;
  outcome_hash: string | null;
  outcome_pointer: string | null;
};

export type LeaseRow = {
  tenant_id: string;
  resource_key: string;
  holder_id: string;
  acquired_at: Date;
  expires_at: Date;
};

export type AttemptEventRow = {
  tenant_id: string;
  event_id: number;
  attempt_id: string;
  ts: Date;
  event_type: string;
  details: unknown;
};
