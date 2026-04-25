import type { AuthLocalization } from '@daveyplate/better-auth-ui'

// Override only the "organization" wording from @daveyplate/better-auth-ui's
// English defaults so users see "project" everywhere. Better Auth's
// internal SDK still uses the `organization` plugin under the hood.
export const authLocalizationEn: AuthLocalization = {
  // ── Organization errors ──
  YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION: 'You are not allowed to create a new project',
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS: 'You have reached the maximum number of projects',
  ORGANIZATION_ALREADY_EXISTS: 'Project already exists',
  ORGANIZATION_NOT_FOUND: 'Project not found',
  USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: 'User is not a member of the project',
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION: 'You are not allowed to update this project',
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION: 'You are not allowed to delete this project',
  NO_ACTIVE_ORGANIZATION: 'No active project',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'User is already a member of this project',
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: 'You cannot leave the project as the only owner',
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: 'You are not allowed to invite users to this project',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: 'User is already invited to this project',
  INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION: 'Inviter is no longer a member of the project',
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: 'Project membership limit reached',
  NOT_ORGANIZATION_MEMBER: 'Not a project member',

  // ── Organization UI ──
  CREATE_ORGANIZATION: 'Create project',
  ORGANIZATION: 'Project',
  ORGANIZATION_NAME: 'Name',
  ORGANIZATION_NAME_PLACEHOLDER: 'My Project',
  ORGANIZATION_NAME_DESCRIPTION: 'This is your project display name.',
  ORGANIZATION_NAME_INSTRUCTIONS: 'Please use 32 characters at maximum.',
  ORGANIZATION_SLUG: 'URL slug',
  ORGANIZATION_SLUG_DESCRIPTION: 'This is your project URL namespace.',
  ORGANIZATION_SLUG_INSTRUCTIONS: 'Please use 48 characters at maximum.',
  ORGANIZATION_SLUG_PLACEHOLDER: 'my-project',
  CREATE_ORGANIZATION_SUCCESS: 'Project created successfully',
  ORGANIZATIONS: 'Projects',
  ORGANIZATIONS_DESCRIPTION: 'Manage your projects and memberships.',
  ORGANIZATIONS_INSTRUCTIONS: 'Create a project to collaborate with other users.',
  LEAVE_ORGANIZATION: 'Leave project',
  LEAVE_ORGANIZATION_CONFIRM: 'Are you sure you want to leave this project?',
  LEAVE_ORGANIZATION_SUCCESS: 'Successfully left the project.',
  MANAGE_ORGANIZATION: 'Manage project',
  REMOVE_MEMBER_CONFIRM: 'Are you sure you want to remove this member from the project?',
  MEMBERS_INSTRUCTIONS: 'Invite new members to your project.',
  INVITE_MEMBER_DESCRIPTION: 'Send an invitation to add a new member to your project.',
  PENDING_INVITATIONS_DESCRIPTION: 'Manage pending invitations for the project.',
  PENDING_USER_INVITATIONS_DESCRIPTION: 'Project invitations you have received.',
  ACCEPT_INVITATION_DESCRIPTION: 'You have been invited to join a project.',
  DELETE_ORGANIZATION: 'Delete project',
  DELETE_ORGANIZATION_DESCRIPTION:
    'Permanently delete your project and all of its contents. This action is not reversible — please proceed with caution.',
  DELETE_ORGANIZATION_SUCCESS: 'Project deleted',
  DELETE_ORGANIZATION_INSTRUCTIONS: 'Enter the project slug to continue:',
  SLUG_REQUIRED: 'Please enter the project slug',
}
