// Who may do what with the franchise pipeline and its invoices (round 49).
//
// franchise_access on profiles:
//   none    — no franchise section at all
//   view    — sees the pipeline and invoices, read-only
//   edit    — МПП: works the pipeline (stages, anketa, …) and invoices
//   finance — финдиректор: sees the pipeline read-only, but creates/sends
//             invoices, marks them paid and receives overdue reminders
// role = "hq" can do everything. Mirrors the SQL helpers can_view_franchise()
// / can_edit_franchise() / can_bill_franchise() used by RLS.

type AccessProfile = { role: string; franchise_access: string };

export function canEditFranchise(p: AccessProfile): boolean {
  return p.role === "hq" || p.franchise_access === "edit";
}

export function canBillFranchise(p: AccessProfile): boolean {
  return canEditFranchise(p) || p.franchise_access === "finance";
}

export function canViewFranchise(p: AccessProfile): boolean {
  return canBillFranchise(p) || p.franchise_access === "view";
}
