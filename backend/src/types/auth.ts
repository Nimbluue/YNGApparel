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

export interface AuthDbUserWithPasswordRow extends AuthDbUserRow {
  password_hash: string;
  last_login_at: Date | string | null;
}

export interface AuthenticatedUser extends AuthUserDto {
  id: number;
  tokenVersion: number;
}

export type FindUserByUuidFn = (userUuid: string) => Promise<AuthDbUserRow | null>;
