import type { AuthLocalization } from '@daveyplate/better-auth-ui'

// Apollokit's user-facing terminology under the dual-tenant model:
//
//   Better Auth `organization` → "Company" (the parent account).
//     Maps to the user's billing entity. Most users see this once (during
//     signup) and rarely afterwards — it's where billing & cross-project
//     member management live.
//
//   Better Auth `team` → "Project" (the actual workspace / game / app).
//     This is the daily concept users see in the sidebar / switcher /
//     business modules. ALL business data is scoped to a project (FK
//     `tenant_id` → `team.id`).
//
// Strings are organized by the daveyplate component that consumes them.
// The schema string keys themselves are dictated by Better Auth and
// `@daveyplate/better-auth-ui` — we only override the values.
export const authLocalizationEn: AuthLocalization = {
  // ── Organization (= Company) errors ──
  YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
    'You are not allowed to create a new company',
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
    'You have reached the maximum number of companies',
  ORGANIZATION_ALREADY_EXISTS: 'Company already exists',
  ORGANIZATION_NOT_FOUND: 'Company not found',
  USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: 'User is not a member of the company',
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
    'You are not allowed to update this company',
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
    'You are not allowed to delete this company',
  NO_ACTIVE_ORGANIZATION: 'No active company',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
    'User is already a member of this company',
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
    'You cannot leave the company as the only owner',
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
    'You are not allowed to invite users to this company',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
    'User is already invited to this company',
  INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
    'Inviter is no longer a member of the company',
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: 'Company membership limit reached',
  NOT_ORGANIZATION_MEMBER: 'Not a company member',

  // ── Organization (= Company) UI ──
  CREATE_ORGANIZATION: 'Create company',
  ORGANIZATION: 'Company',
  ORGANIZATION_NAME: 'Name',
  ORGANIZATION_NAME_PLACEHOLDER: 'Acme Inc.',
  ORGANIZATION_NAME_DESCRIPTION: 'This is your company display name.',
  ORGANIZATION_NAME_INSTRUCTIONS: 'Please use 32 characters at maximum.',
  ORGANIZATION_SLUG: 'URL slug',
  ORGANIZATION_SLUG_DESCRIPTION: 'This is your company URL namespace.',
  ORGANIZATION_SLUG_INSTRUCTIONS: 'Please use 48 characters at maximum.',
  ORGANIZATION_SLUG_PLACEHOLDER: 'acme',
  CREATE_ORGANIZATION_SUCCESS: 'Company created successfully',
  ORGANIZATIONS: 'Companies',
  ORGANIZATIONS_DESCRIPTION: 'Manage your companies and memberships.',
  ORGANIZATIONS_INSTRUCTIONS:
    'Create a company to collaborate with other users.',
  LEAVE_ORGANIZATION: 'Leave company',
  LEAVE_ORGANIZATION_CONFIRM: 'Are you sure you want to leave this company?',
  LEAVE_ORGANIZATION_SUCCESS: 'Successfully left the company.',
  MANAGE_ORGANIZATION: 'Manage company',
  REMOVE_MEMBER_CONFIRM:
    'Are you sure you want to remove this member from the company?',
  MEMBERS_INSTRUCTIONS: 'Invite new members to your company.',
  INVITE_MEMBER_DESCRIPTION:
    'Send an invitation to add a new member to your company.',
  PENDING_INVITATIONS_DESCRIPTION: 'Manage pending invitations for the company.',
  PENDING_USER_INVITATIONS_DESCRIPTION:
    'Company invitations you have received.',
  ACCEPT_INVITATION_DESCRIPTION: 'You have been invited to join a company.',
  DELETE_ORGANIZATION: 'Delete company',
  DELETE_ORGANIZATION_DESCRIPTION:
    'Permanently delete your company and all of its contents. This action is not reversible — please proceed with caution.',
  DELETE_ORGANIZATION_SUCCESS: 'Company deleted',
  DELETE_ORGANIZATION_INSTRUCTIONS: 'Enter the company slug to continue:',
  SLUG_REQUIRED: 'Please enter the company slug',

  // ── Team (= Project) errors ──
  TEAM_LIMIT_REACHED: 'Project limit reached',
  TEAM_MEMBER_LIMIT_REACHED: 'Project member limit reached',
  TEAM_NOT_FOUND: 'Project not found',
  TEAM_MEMBER_NOT_FOUND: 'Project member not found',
  TEAM_NAME_TOO_LONG: 'Project name is too long',
  ALREADY_TEAM_MEMBER: 'Already a project member',
  INSUFFICIENT_TEAM_PERMISSIONS: 'Insufficient project permissions',
  TEAM_ALREADY_EXISTS: 'Project already exists',
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
    'You have reached the maximum number of projects',
  YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
    'You are not allowed to create projects in this company',
  YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
    'You are not allowed to delete projects in this company',

  // ── Team (= Project) UI ──
  TEAMS: 'Projects',
  TEAM_ACTIVE: 'Active project',
  TEAM_SET_ACTIVE: 'Set as active project',
  CREATE_TEAM: 'Create project',
  CREATE_TEAM_INSTRUCTIONS:
    'Set up a new project to isolate game data, members, and integrations.',
  CREATE_TEAM_SUCCESS: 'Project created successfully',
  UPDATE_TEAM: 'Update project',
  UPDATE_TEAMS: 'Projects',
  UPDATE_TEAMS_DESCRIPTION: 'Manage projects under this company.',
  UPDATE_TEAM_DESCRIPTION: 'Rename or relabel this project.',
  UPDATE_TEAM_SUCCESS: 'Project updated',
  DELETE_TEAM: 'Delete project',
  DELETE_TEAM_DESCRIPTION:
    'Permanently delete this project and every record scoped to it (activities, items, players, audit logs, …). This action is not reversible.',
  DELETE_TEAM_INSTRUCTIONS: 'Enter the project name to continue:',
  DELETE_TEAM_SUCCESS: 'Project deleted',
  REMOVE_TEAM_CONFIRM: 'Are you sure you want to remove this project?',
  SELECT_TEAMS: 'Select projects',
  TEAM_NAME: 'Project name',
  TEAM_NAME_DESCRIPTION: 'This is your project display name.',
  TEAM_NAME_INSTRUCTIONS: 'Please use 32 characters at maximum.',
  TEAM_NAME_PLACEHOLDER: 'My Game',
  TEAM_NAME_REQUIRED: 'Please enter a project name',
  TEAM_NAME_DOES_NOT_MATCH: 'Project name does not match',
  TEAM_MEMBERS: 'Project members',
  TEAM_MEMBERS_DESCRIPTION: 'Manage members of this project.',
  ADD_TEAM_MEMBER: 'Add project member',
  ADD_TEAM_MEMBER_SUCCESS: 'Project member added',
  REMOVE_TEAM_MEMBER: 'Remove project member',
  REMOVE_TEAM_MEMBER_CONFIRM:
    'Are you sure you want to remove this project member?',
  REMOVE_TEAM_MEMBER_SUCCESS: 'Project member removed',
  MANAGE_TEAM_MEMBERS: 'Manage project members',
  MANAGE_TEAM_MEMBERS_DESCRIPTION:
    'Invite, role-change, or remove members for this project.',
}
