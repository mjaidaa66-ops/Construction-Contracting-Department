import type { Role } from '../types/bunyan';

export interface RolePermissions {
  role: Role;
  canManageProjects: boolean;
  canDeleteProjects: boolean;
  canEditEngineering: boolean;
  canEditFinancials: boolean;
  canManageGovernment: boolean;
  canManageCompanySettings: boolean;
}

export function getRolePermissions(role: Role): RolePermissions {
  switch (role) {
    case 'admin':
      return {
        role,
        canManageProjects: true,
        canDeleteProjects: true,
        canEditEngineering: true,
        canEditFinancials: true,
        canManageGovernment: true,
        canManageCompanySettings: true,
      };
    case 'engineer':
      return {
        role,
        canManageProjects: true,
        canDeleteProjects: false,
        canEditEngineering: true,
        canEditFinancials: false,
        canManageGovernment: true,
        canManageCompanySettings: false,
      };
    case 'accountant':
      return {
        role,
        canManageProjects: false,
        canDeleteProjects: false,
        canEditEngineering: false,
        canEditFinancials: true,
        canManageGovernment: false,
        canManageCompanySettings: false,
      };
  }
}
