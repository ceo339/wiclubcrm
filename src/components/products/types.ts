import type { Tables } from "@/types/database";

export type Product = Tables<"products"> & { partner_name: string | null };
export type Cohort = Tables<"product_cohorts">;
