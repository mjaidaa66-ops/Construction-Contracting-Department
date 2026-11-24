import type { Role } from '../types/bunyan';

export interface RolePermissions {
  role: Role;
  canManageProjects: boolean;
  canDeleteProjects: boolean;
  canEditEngineering: boolean;
  canEditFinancials: boolean;
  canManageGovernment: boolean;
  canManageCompanySettings: boolean;
  // Reports & Printing Center granular permissions
  canViewReports: boolean;
  canCreateReports: boolean;
  canEditReports: boolean;
  canDeleteReports: boolean;
  canPrintReports: boolean;
  canExportReports: boolean;
  canManageTemplates: boolean;
  canViewFinancialReports: boolean;
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
        canViewReports: true,
        canCreateReports: true,
        canEditReports: true,
        canDeleteReports: true,
        canPrintReports: true,
        canExportReports: true,
        canManageTemplates: true,
        canViewFinancialReports: true,
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
        canViewReports: true,
        canCreateReports: true,
        canEditReports: true,
        canDeleteReports: false,
        canPrintReports: true,
        canExportReports: true,
        canManageTemplates: false,
        canViewFinancialReports: false,
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
        canViewReports: true,
        canCreateReports: true,
        canEditReports: false,
        canDeleteReports: false,
        canPrintReports: true,
        canExportReports: true,
        canManageTemplates: false,
        canViewFinancialReports: true,
      };
  }
}
