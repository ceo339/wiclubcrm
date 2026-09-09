import type { Tables } from "@/types/database";

export type Lead = Tables<"leads"> & { partner_name: string | null };
