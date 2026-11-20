import type { AuthUserDto, UserRole } from '@yng/shared';

export interface AuthDbUserRow {
  id: number;
  user_uuid: string;
  role: UserRole;
  full_name: string;
  email: string;
  whatsapp: string | null;
  is_active: boolean;
  token_version: number;
}

export interface AuthenticatedUser extends AuthUserDto {
  id: number;
  whatsapp: string | null;
  tokenVersion: number;
}

export type FindUserByUuidFn = (userUuid: string) => Promise<AuthDbUserRow | null>;
