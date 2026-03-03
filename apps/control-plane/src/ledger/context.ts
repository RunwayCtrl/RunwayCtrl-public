export type TenantContext = {
  tenantId: string;
};

export type RequestContext = TenantContext & {
  requestId?: string;
  traceId?: string;
};
