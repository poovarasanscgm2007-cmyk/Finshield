export type UserRole =
  | 'AP Employee'
  | 'Procurement Employee'
  | 'Warehouse Employee'
  | 'Finance Manager'
  | 'Admin';

export type Permission =
  | 'invoices:upload'
  | 'invoices:view'
  | 'matching:view'
  | 'investigations:create'
  | 'investigations:resolve_price'
  | 'investigations:resolve_quantity'
  | 'po:view'
  | 'po:edit'
  | 'po:approve_change'
  | 'grn:view'
  | 'grn:edit'
  | 'approvals:view'
  | 'approvals:act'
  | 'risk:view'
  | 'payment:approve'
  | 'users:manage'
  | 'rules:manage'
  | 'audit:view';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  'AP Employee': [
    'invoices:upload',
    'invoices:view',
    'matching:view',
    'investigations:create',
    'approvals:view'
  ],
  'Procurement Employee': [
    'po:view',
    'po:edit',
    'investigations:resolve_price',
    'approvals:view'
  ],
  'Warehouse Employee': [
    'grn:view',
    'grn:edit',
    'investigations:resolve_quantity',
    'approvals:view'
  ],
  'Finance Manager': [
    'po:view',
    'po:approve_change',
    'approvals:view',
    'approvals:act',
    'risk:view',
    'payment:approve',
    'audit:view',
    'invoices:view',
    'matching:view'
  ],
  'Admin': [
    'users:manage',
    'rules:manage',
    'audit:view',
    'po:view',
    'invoices:view',
    'grn:view',
    'approvals:view'
    // NOTE: Golden Rule & Spec explicitly states Admin must NOT be able to approve payments!
  ]
};

export const hasPermission = (role: UserRole, permission: Permission): boolean => {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.includes(permission) : false;
};
