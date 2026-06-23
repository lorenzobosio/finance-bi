// src/lib/database.types.ts — the typed read/write surface for the @supabase/ssr client
// (DSN-06c / D3-13). A renamed `v_*` column becomes a COMPILE error at the `.from("v_*")`
// call site instead of silently resolving to `undefined → 0` in the UI.
//
// HAND-AUTHORED FALLBACK (RESEARCH §Environment Availability): the Supabase CLI is not
// available in this environment, so this file is hand-written to match the live column shapes
// the app reads — the `v_*` analytics views (mirrored from `drizzle/0007_marts.sql` /
// `src/lib/db/marts.ts`, which are the same contract) plus the base tables the Server Actions
// write. Phase-7 DAT-03 swaps this for the CLI-generated file via
// `supabase gen types typescript --linked > src/lib/database.types.ts` and the CI drift gate
// already scaffolded in `.github/workflows/ci.yml` asserts the two never diverge.
//
// FND-03 (T-03-06): this is a PURE TYPE file with ZERO runtime imports. It must NEVER pull in
// `marts.ts`, `drizzle-orm`, `postgres`, or `DATABASE_URL` — the typed read uses only this
// generic, so the app bundle stays free of the write-plane DB driver. Do not add any
// `import`/`require` of a runtime module here.

// supabase-js surfaces numeric/timestamp columns as strings over the wire; money columns are
// numeric(14,2) and arrive as strings, so the Row types use `string` (the page's `num()`
// coercion turns them into finite numbers). Nullable mirrors the SQL nullability.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// A money column: numeric over the wire → string; non-null unless the view declares it nullable.
type Money = string;

export type Database = {
  public: {
    Tables: {
      // --- Writable base tables (Server Actions) ---------------------------------------
      transactions: {
        Row: {
          id: string;
          account_id: string | null;
          booking_date: string | null;
          description: string | null;
          description_raw: string | null;
          counterparty: string | null;
          amount_eur: Money;
          flow_type: string | null;
          category_id: string | null;
          cost_center: string | null;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          booking_date?: string | null;
          description?: string | null;
          description_raw?: string | null;
          counterparty?: string | null;
          amount_eur?: Money;
          flow_type?: string | null;
          category_id?: string | null;
          cost_center?: string | null;
        };
        Update: {
          id?: string;
          account_id?: string | null;
          booking_date?: string | null;
          description?: string | null;
          description_raw?: string | null;
          counterparty?: string | null;
          amount_eur?: Money;
          flow_type?: string | null;
          category_id?: string | null;
          cost_center?: string | null;
        };
        // Embedded-relation reads (`accounts(name), categories(name)`) need the FK relationships
        // declared so supabase-js resolves the join shape instead of a SelectQueryError.
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      budgets: {
        Row: {
          id: string;
          cost_center: string;
          category_id: string | null;
          period_key: number;
          amount_eur: Money;
        };
        Insert: {
          id?: string;
          cost_center: string;
          category_id?: string | null;
          period_key: number;
          amount_eur: Money | number;
        };
        Update: {
          id?: string;
          cost_center?: string;
          category_id?: string | null;
          period_key?: number;
          amount_eur?: Money | number;
        };
        Relationships: [];
      };
      rules: {
        Row: {
          id: string;
          match_criteria: Json;
          set_category: string | null;
          set_cost_center: string | null;
          priority: number;
          version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          match_criteria: Json;
          set_category?: string | null;
          set_cost_center?: string | null;
          priority?: number;
          version?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          match_criteria?: Json;
          set_category?: string | null;
          set_cost_center?: string | null;
          priority?: number;
          version?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      connections: {
        Row: {
          id: string;
          last_pull_at: string | null;
          consent_status: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          last_pull_at?: string | null;
          consent_status?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          last_pull_at?: string | null;
          consent_status?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: { id: string; name: string };
        Insert: { id?: string; name: string };
        Update: { id?: string; name?: string };
        Relationships: [];
      };
      cost_centers: {
        Row: { code: string; label: string };
        Insert: { code: string; label: string };
        Update: { code?: string; label?: string };
        Relationships: [];
      };
      accounts: {
        Row: { id: string; name: string };
        Insert: { id?: string; name: string };
        Update: { id?: string; name?: string };
        Relationships: [];
      };
    };
    Views: {
      // --- Analytics marts (read-only; mirror drizzle/0007_marts.sql) -------------------
      v_home_kpis: {
        Row: {
          period_key: number;
          revenue: Money;
          investimento: Money;
          costs: Money;
          sublet_net: Money;
          result: Money;
          margin: Money | null;
          net_worth: Money;
        };
        Relationships: [];
      };
      v_pnl_monthly: {
        Row: {
          period_key: number;
          revenue: Money;
          costs: Money;
          investimento: Money;
          sublet_net: Money;
          result: Money;
          margin: Money | null;
        };
        Relationships: [];
      };
      v_sublet_pnl: {
        Row: {
          period_key: number;
          sublet_revenue: Money;
          sublet_costs: Money;
          sublet_net: Money;
        };
        Relationships: [];
      };
      v_costcenter_bva: {
        Row: {
          cost_center: string;
          category_id: string | null;
          period_key: number;
          budget: Money;
          actual: Money;
        };
        Relationships: [];
      };
      v_category_breakdown: {
        Row: {
          period_key: number;
          grain: string;
          bucket_key: string | null;
          bucket_label: string;
          costs: Money;
        };
        Relationships: [];
      };
      v_pct_of_revenue: {
        Row: {
          period_key: number;
          category_id: string | null;
          category_label: string;
          category_cost: Money;
          revenue: Money;
          pct_of_revenue: Money | null;
        };
        Relationships: [];
      };
      v_balance_trend: {
        Row: {
          date: string;
          period_key: number;
          net_worth: Money;
        };
        Relationships: [];
      };
    };
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
