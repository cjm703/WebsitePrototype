import { sessionApiFetchAt } from "./api-client";
import { supabaseUrl } from "./supabase-env";

const SYSTEM_STATUS_API_BASE = `${supabaseUrl}/functions/v1/system-status`;

export interface SupabaseTableStorageMetric {
  name: string;
  bytes: number;
  estimatedRows: number;
}

export interface SupabaseBucketStorageMetric {
  name: string;
  bytes: number;
  objects: number;
  public: boolean;
  truncated: boolean;
}

export interface SupabaseStorageStatus {
  checkedAt: string;
  database: {
    bytes: number | null;
    tables: SupabaseTableStorageMetric[];
  };
  objectStorage: {
    bytes: number;
    objects: number;
    buckets: SupabaseBucketStorageMetric[];
  };
  sessions: {
    active: number;
    total: number;
  };
  warnings: string[];
}

export async function loadSupabaseStorageStatus(): Promise<SupabaseStorageStatus> {
  return sessionApiFetchAt(SYSTEM_STATUS_API_BASE, "/storage", { method: "GET" }) as Promise<SupabaseStorageStatus>;
}
