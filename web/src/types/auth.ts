export interface Profile {
  id: string;
  name: string;
  profile_key?: string;
  owner_id?: string;
  settings?: string;
  created_at?: number;
  updated_at?: number;
}

export interface UserInfo {
  id: string;
  username: string;
  role: "admin" | "user";
  timezone?: string | null;
  locale?: string | null;
  password_version?: number;
  pin_enabled?: boolean;
  session_lock_timeout?: number;
  max_log_retention_days?: number;
}

export interface AccessPoint {
  id: string;
  profile_id: string;
  name: string;
  token: string;
  created_at: number;
}
