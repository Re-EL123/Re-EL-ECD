export const ROLES = {
  PLATFORM_SUPER_ADMIN: 'platform_super_admin',
  PLATFORM_SUPPORT_ADMIN: 'platform_support_admin',
  PLATFORM_FINANCE_ADMIN: 'platform_finance_admin',
  ORGANISATION_OWNER: 'organisation_owner',
  PRINCIPAL: 'principal',
  DAYCARE_ADMINISTRATOR: 'daycare_administrator',
  DAYCARE_MANAGER: 'daycare_manager',
  CURRICULUM_COORDINATOR: 'curriculum_coordinator',
  TEACHER: 'teacher',
  ASSISTANT_TEACHER: 'assistant_teacher',
  SUPPORT_STAFF: 'support_staff',
  FINANCE_OFFICER: 'finance_officer',
  ADMISSIONS_OFFICER: 'admissions_officer',
  PARENT_GUARDIAN: 'parent_guardian',
  SUBSTITUTE_STAFF: 'substitute_staff'
};

export const ROLE_HIERARCHY = {
  [ROLES.PLATFORM_SUPER_ADMIN]: 100,
  [ROLES.ORGANISATION_OWNER]: 90,
  [ROLES.PRINCIPAL]: 80,
  [ROLES.DAYCARE_ADMINISTRATOR]: 75,
  [ROLES.DAYCARE_MANAGER]: 70,
  [ROLES.FINANCE_OFFICER]: 65,
  [ROLES.CURRICULUM_COORDINATOR]: 65,
  [ROLES.ADMISSIONS_OFFICER]: 60,
  [ROLES.TEACHER]: 50,
  [ROLES.ASSISTANT_TEACHER]: 40,
  [ROLES.SUBSTITUTE_STAFF]: 30,
  [ROLES.SUPPORT_STAFF]: 20,
  [ROLES.PARENT_GUARDIAN]: 10
};
