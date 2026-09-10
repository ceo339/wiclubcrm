import type { Tables } from "@/types/database";

export type Member = Tables<"members"> & {
  partner_name: string | null;
  product_name: string | null;
  product_price: number | null;
  product_sessions: number | null;
};
