import { USER_ROLE } from '@yng/shared';
import { query } from '../config/database.js';
import type { AuthDbUserRow, AuthDbUserWithPasswordRow } from '../types/auth.js';

export interface CreateCustomerUserInput {
  fullName: string;
  email: string;
  whatsapp: string;
  passwordHash: string;
}

export interface UserRepository {
  findByEmail(emailLower: string): Promise<AuthDbUserWithPasswordRow | null>;
  findById(id: number): Promise<AuthDbUserWithPasswordRow | null>;
  findByUuid(userUuid: string): Promise<AuthDbUserRow | null>;
  createCustomer(input: CreateCustomerUserInput): Promise<AuthDbUserRow>;
  updateLastLoginAt(id: number): Promise<void>;
  updatePasswordAndBumpTokenVersion(
    id: number,
    newPasswordHash: string
  ): Promise<AuthDbUserRow | null>;
}

const PUBLIC_AUTH_COLUMNS =
  'id, user_uuid, role, full_name, email, whatsapp, is_active, token_version';
const AUTH_WITH_PASSWORD_COLUMNS = `${PUBLIC_AUTH_COLUMNS}, password_hash, last_login_at`;

export const userModel: UserRepository = {
  async findByEmail(emailLower: string): Promise<AuthDbUserWithPasswordRow | null> {
    const result = await query<AuthDbUserWithPasswordRow>(
      `SELECT ${AUTH_WITH_PASSWORD_COLUMNS}
       FROM users
       WHERE lower(email) = $1
       LIMIT 1`,
      [emailLower]
    );
    return result.rows[0] ?? null;
  },

  async findById(id: number): Promise<AuthDbUserWithPasswordRow | null> {
    const result = await query<AuthDbUserWithPasswordRow>(
      `SELECT ${AUTH_WITH_PASSWORD_COLUMNS}
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async findByUuid(userUuid: string): Promise<AuthDbUserRow | null> {
    const result = await query<AuthDbUserRow>(
      `SELECT ${PUBLIC_AUTH_COLUMNS}
       FROM users
       WHERE user_uuid = $1
       LIMIT 1`,
      [userUuid]
    );
    return result.rows[0] ?? null;
  },

  async createCustomer(input: CreateCustomerUserInput): Promise<AuthDbUserRow> {
    // Registrasi publik selalu menetapkan role USER; role tidak pernah diterima dari client.
    const result = await query<AuthDbUserRow>(
      `INSERT INTO users (role, full_name, email, whatsapp, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${PUBLIC_AUTH_COLUMNS}`,
      [USER_ROLE.USER, input.fullName, input.email, input.whatsapp, input.passwordHash]
    );
    return result.rows[0];
  },

  async updateLastLoginAt(id: number): Promise<void> {
    await query(
      `UPDATE users
       SET last_login_at = NOW()
       WHERE id = $1`,
      [id]
    );
  },

  async updatePasswordAndBumpTokenVersion(
    id: number,
    newPasswordHash: string
  ): Promise<AuthDbUserRow | null> {
    const result = await query<AuthDbUserRow>(
      `UPDATE users
       SET password_hash = $1,
           token_version = token_version + 1
       WHERE id = $2
         AND is_active = TRUE
       RETURNING ${PUBLIC_AUTH_COLUMNS}`,
      [newPasswordHash, id]
    );
    return result.rows[0] ?? null;
  },
};

export default userModel;
