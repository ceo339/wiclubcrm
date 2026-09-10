import type { Tables } from "@/types/database";

export type Payment = Tables<"payments"> & {
  partner_name: string | null;
  member_name: string | null;
  product_name: string | null;
};

export type MemberOption = {
  id: string;
  name: string;
  product_id: string | null;
  product_name: string | null;
  product_price: number | null;
};
