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
      // --- Identity (PERS-01/02) --------------------------------------------------------
      // members maps the authenticated Google email → a household member (resolveMember reads
      // auth_email; the greeting renders display_name only, never the email — D4-23/24/25).
      // onboarding_dismissed_at is the household-scoped dismissal flag (D4-21). email is the
      // Phase-0 column, unused this phase. All non-id columns arrive as string|null over the
      // wire (timestamptz → string). NOT a demo-bearing table — no is_demo.
      members: {
        Row: {
          id: string;
          display_name: string;
          email: string | null;
          auth_email: string | null;
          onboarding_dismissed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          display_name: string;
          email?: string | null;
          auth_email?: string | null;
          onboarding_dismissed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          email?: string | null;
          auth_email?: string | null;
          onboarding_dismissed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
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
          is_demo: boolean;
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
          is_demo?: boolean;
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
          is_demo?: boolean;
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
          is_demo: boolean;
        };
        Insert: {
          id?: string;
          cost_center: string;
          category_id?: string | null;
          period_key: number;
          amount_eur: Money | number;
          is_demo?: boolean;
        };
        Update: {
          id?: string;
          cost_center?: string;
          category_id?: string | null;
          period_key?: number;
          amount_eur?: Money | number;
          is_demo?: boolean;
        };
        Relationships: [];
      };
      // --- Demo-bearing fact/config tables (is_demo partition, D4-09) -------------------
      // The seed writer (scripts/seed-demo.ts) writes is_demo=true rows here; real ingestion
      // never sets is_demo (defaults false). Money columns are string over the wire.
      balances: {
        Row: {
          id: string;
          account_id: string;
          as_of_date: string;
          balance_eur: Money;
          is_demo: boolean;
        };
        Insert: {
          id?: string;
          account_id: string;
          as_of_date: string;
          balance_eur: Money | number;
          is_demo?: boolean;
        };
        Update: {
          id?: string;
          account_id?: string;
          as_of_date?: string;
          balance_eur?: Money | number;
          is_demo?: boolean;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          name: string;
          target_eur: Money;
          metric: string;
          is_demo: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          target_eur: Money | number;
          metric?: string;
          is_demo?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          target_eur?: Money | number;
          metric?: string;
          is_demo?: boolean;
        };
        Relationships: [];
      };
      milestones: {
        Row: {
          id: string;
          goal_id: string;
          threshold_eur: Money;
          achieved_at: string | null;
          is_demo: boolean;
        };
        Insert: {
          id?: string;
          goal_id: string;
          threshold_eur: Money | number;
          achieved_at?: string | null;
          is_demo?: boolean;
        };
        Update: {
          id?: string;
          goal_id?: string;
          threshold_eur?: Money | number;
          achieved_at?: string | null;
          is_demo?: boolean;
        };
        Relationships: [];
      };
      investment_contributions: {
        Row: {
          id: string;
          transaction_id: string | null;
          amount_eur: Money;
          period_key: number;
          member_id: string | null;
          is_demo: boolean;
        };
        Insert: {
          id?: string;
          transaction_id?: string | null;
          amount_eur: Money | number;
          period_key: number;
          member_id?: string | null;
          is_demo?: boolean;
        };
        Update: {
          id?: string;
          transaction_id?: string | null;
          amount_eur?: Money | number;
          period_key?: number;
          member_id?: string | null;
          is_demo?: boolean;
        };
        Relationships: [];
      };
      insights: {
        Row: {
          id: string;
          kind: string | null;
          body: string | null;
          created_at: string;
          token_count: number | null;
          is_demo: boolean;
        };
        Insert: {
          id?: string;
          kind?: string | null;
          body?: string | null;
          created_at?: string;
          token_count?: number | null;
          is_demo?: boolean;
        };
        Update: {
          id?: string;
          kind?: string | null;
          body?: string | null;
          created_at?: string;
          token_count?: number | null;
          is_demo?: boolean;
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
          is_demo: boolean;
        };
        Insert: {
          id?: string;
          last_pull_at?: string | null;
          consent_status?: string | null;
          created_at?: string;
          is_demo?: boolean;
        };
        Update: {
          id?: string;
          last_pull_at?: string | null;
          consent_status?: string | null;
          created_at?: string;
          is_demo?: boolean;
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
      // --- Phase-5 (0014) Goal-as-a-Journey tables --------------------------------------
      // buckets: REFERENCE data (3 rows over one ETF, GOAL-07) — no is_demo. monthly_target_eur
      // is numeric → Money string, nullable (Adventures has no fixed target).
      buckets: {
        Row: {
          code: string;
          name: string;
          instrument_isin: string;
          monthly_target_eur: Money | null;
        };
        Insert: {
          code: string;
          name: string;
          instrument_isin: string;
          monthly_target_eur?: Money | number | null;
        };
        Update: {
          code?: string;
          name?: string;
          instrument_isin?: string;
          monthly_target_eur?: Money | number | null;
        };
        Relationships: [];
      };
      // household: singleton settings (D5-01/10/17), DEMO-BEARING. launch_date NULL = pre-launch
      // (D5-16); why is the shared editable statement; epic_trip_active gates Adventures big-trip.
      household: {
        Row: {
          id: string;
          launch_date: string | null;
          why: string | null;
          epic_trip_active: boolean;
          is_demo: boolean;
        };
        Insert: {
          id?: string;
          launch_date?: string | null;
          why?: string | null;
          epic_trip_active?: boolean;
          is_demo?: boolean;
        };
        Update: {
          id?: string;
          launch_date?: string | null;
          why?: string | null;
          epic_trip_active?: boolean;
          is_demo?: boolean;
        };
        Relationships: [];
      };
      // goal_events: once-only celebrations (GOAL-11), DEMO-BEARING. dedupe_key is unique per
      // (dedupe_key, is_demo); seen is PATCHed true after the client plays it.
      goal_events: {
        Row: {
          id: string;
          kind: string;
          threshold: number | null;
          period_key: number | null;
          achieved_at: string;
          dedupe_key: string;
          seen: boolean;
          is_demo: boolean;
        };
        Insert: {
          id?: string;
          kind: string;
          threshold?: number | null;
          period_key?: number | null;
          achieved_at?: string;
          dedupe_key: string;
          seen?: boolean;
          is_demo?: boolean;
        };
        Update: {
          id?: string;
          kind?: string;
          threshold?: number | null;
          period_key?: number | null;
          achieved_at?: string;
          dedupe_key?: string;
          seen?: boolean;
          is_demo?: boolean;
        };
        Relationships: [];
      };
      // transfer_overrides: per-transfer manual split (D5-05), DEMO-BEARING. transaction_id is PK.
      transfer_overrides: {
        Row: {
          transaction_id: string;
          wealth_eur: Money;
          brazil_eur: Money;
          adv_small_eur: Money;
          adv_big_eur: Money;
          is_demo: boolean;
        };
        Insert: {
          transaction_id: string;
          wealth_eur: Money | number;
          brazil_eur: Money | number;
          adv_small_eur: Money | number;
          adv_big_eur: Money | number;
          is_demo?: boolean;
        };
        Update: {
          transaction_id?: string;
          wealth_eur?: Money | number;
          brazil_eur?: Money | number;
          adv_small_eur?: Money | number;
          adv_big_eur?: Money | number;
          is_demo?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "transfer_overrides_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      // --- Analytics marts (read-only; mirror drizzle/0007_marts.sql) -------------------
      // Every mart carries is_demo (the partition column from 0010); the demo-mode chokepoint
      // src/lib/demo/mode.ts adds .eq('is_demo', true|false) to every read so it is typed.
      v_home_kpis: {
        Row: {
          period_key: number;
          is_demo: boolean;
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
          is_demo: boolean;
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
          is_demo: boolean;
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
          is_demo: boolean;
          budget: Money;
          actual: Money;
        };
        Relationships: [];
      };
      v_category_breakdown: {
        Row: {
          period_key: number;
          is_demo: boolean;
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
          is_demo: boolean;
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
          is_demo: boolean;
          net_worth: Money;
        };
        Relationships: [];
      };
      // v_bucket_spend (GOAL-13 / VIZ-01; drizzle/0014_goal_journey.sql) — per-bucket
      // (cost_center) tagged spend at category grain per period, is_demo-partitioned. `costs`
      // is the positive spend magnitude; category_id is null for the coalesced Uncategorized
      // bucket. Feeds the Brazil/Adventures tagged-spend lists + the per-bucket category donut.
      v_bucket_spend: {
        Row: {
          period_key: number;
          is_demo: boolean;
          cost_center: string | null;
          category_id: string | null;
          category_label: string;
          costs: Money;
        };
        Relationships: [];
      };
    };
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
