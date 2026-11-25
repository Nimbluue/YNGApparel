import {
  USER_ROLE,
  type CreateUserAddressDto,
  type UpdateProfileRequestDto,
  type UpdateUserAddressDto,
} from '@yng/shared';
import { query, withTransaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthDbUserRow, AuthDbUserWithPasswordRow } from '../types/auth.js';

export interface UserAddressRow {
  id: number;
  address_uuid: string;
  user_id: number;
  label: string;
  recipient_name: string;
  recipient_whatsapp: string;
  province_name: string;
  city_name: string;
  district_name: string;
  postal_code: string;
  full_address: string;
  is_default: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AccountRepository {
  findUserWithPasswordById(userId: number): Promise<AuthDbUserWithPasswordRow | null>;
  updateUserProfile(userId: number, patch: UpdateProfileRequestDto): Promise<AuthDbUserRow | null>;
  deactivateCustomerAccount(userId: number): Promise<boolean>;

  listAddressesByUser(userId: number): Promise<UserAddressRow[]>;
  createAddressAtomic(
    userId: number,
    input: CreateUserAddressDto,
    maxAddresses: number
  ): Promise<UserAddressRow>;
  updateAddressAtomic(
    userId: number,
    addressUuid: string,
    patch: UpdateUserAddressDto
  ): Promise<UserAddressRow | null>;
  deleteAddressAtomic(userId: number, addressUuid: string): Promise<boolean>;
}

const USER_PUBLIC_COLUMNS =
  'id, user_uuid, role, full_name, email, whatsapp, is_active, token_version';
const USER_WITH_PASSWORD_COLUMNS = `${USER_PUBLIC_COLUMNS}, password_hash, last_login_at`;
const ADDRESS_COLUMNS =
  'id, address_uuid, user_id, label, recipient_name, recipient_whatsapp, province_name, city_name, district_name, postal_code, full_address, is_default, created_at, updated_at';

export const accountModel: AccountRepository = {
  async findUserWithPasswordById(userId: number) {
    const result = await query<AuthDbUserWithPasswordRow>(
      `SELECT ${USER_WITH_PASSWORD_COLUMNS}
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] ?? null;
  },

  async updateUserProfile(userId: number, patch: UpdateProfileRequestDto) {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (patch.fullName !== undefined) {
      values.push(patch.fullName);
      clauses.push(`full_name = $${values.length}`);
    }
    if (patch.whatsapp !== undefined) {
      values.push(patch.whatsapp);
      clauses.push(`whatsapp = $${values.length}`);
    }

    if (clauses.length === 0) {
      const current = await query<AuthDbUserRow>(
        `SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
        [userId]
      );
      return current.rows[0] ?? null;
    }

    values.push(userId);
    const result = await query<AuthDbUserRow>(
      `UPDATE users
       SET ${clauses.join(', ')}
       WHERE id = $${values.length}
         AND is_active = TRUE
       RETURNING ${USER_PUBLIC_COLUMNS}`,
      values
    );
    return result.rows[0] ?? null;
  },

  async deactivateCustomerAccount(userId: number) {
    const result = await query<{ id: number }>(
      `UPDATE users
       SET is_active = FALSE,
           token_version = token_version + 1
       WHERE id = $1
         AND role = $2
         AND is_active = TRUE
       RETURNING id`,
      [userId, USER_ROLE.USER]
    );
    return result.rows.length > 0;
  },

  async listAddressesByUser(userId: number) {
    const result = await query<UserAddressRow>(
      `SELECT ${ADDRESS_COLUMNS}
       FROM user_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, updated_at DESC, id DESC`,
      [userId]
    );
    return result.rows;
  },

  async createAddressAtomic(userId: number, input: CreateUserAddressDto, maxAddresses: number) {
    return withTransaction(async (client) => {
      await client.query(`SELECT id FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE`, [
        userId,
      ]);

      const countResult = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM user_addresses
         WHERE user_id = $1`,
        [userId]
      );
      const currentTotal = countResult.rows[0]?.total ?? 0;

      if (currentTotal >= maxAddresses) {
        throw new AppError(`Maksimal ${maxAddresses} alamat tersimpan per akun.`, 400);
      }

      // ASSUMPTION: alamat pertama otomatis dijadikan alamat utama agar langsung siap saat checkout.
      const effectiveDefault = currentTotal === 0 ? true : Boolean(input.isDefault);

      if (effectiveDefault) {
        await client.query(
          `UPDATE user_addresses
           SET is_default = FALSE
           WHERE user_id = $1
             AND is_default = TRUE`,
          [userId]
        );
      }

      const insertResult = await client.query<UserAddressRow>(
        `INSERT INTO user_addresses (
           user_id, label, recipient_name, recipient_whatsapp,
           province_name, city_name, district_name, postal_code, full_address, is_default
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${ADDRESS_COLUMNS}`,
        [
          userId,
          input.label,
          input.recipientName,
          input.recipientWhatsapp,
          input.provinceName,
          input.cityName,
          input.districtName,
          input.postalCode,
          input.fullAddress,
          effectiveDefault,
        ]
      );

      return insertResult.rows[0];
    });
  },

  async updateAddressAtomic(userId: number, addressUuid: string, patch: UpdateUserAddressDto) {
    return withTransaction(async (client) => {
      await client.query(`SELECT id FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE`, [
        userId,
      ]);

      const existingResult = await client.query<UserAddressRow>(
        `SELECT ${ADDRESS_COLUMNS}
         FROM user_addresses
         WHERE address_uuid = $1
           AND user_id = $2
         LIMIT 1`,
        [addressUuid, userId]
      );

      if (existingResult.rows.length === 0) {
        return null;
      }

      if (patch.isDefault === true) {
        await client.query(
          `UPDATE user_addresses
           SET is_default = FALSE
           WHERE user_id = $1
             AND is_default = TRUE
             AND address_uuid <> $2`,
          [userId, addressUuid]
        );
      }

      const entries: ReadonlyArray<readonly [string, unknown]> = [
        ['label', patch.label],
        ['recipient_name', patch.recipientName],
        ['recipient_whatsapp', patch.recipientWhatsapp],
        ['province_name', patch.provinceName],
        ['city_name', patch.cityName],
        ['district_name', patch.districtName],
        ['postal_code', patch.postalCode],
        ['full_address', patch.fullAddress],
        ['is_default', patch.isDefault],
      ];

      const clauses: string[] = [];
      const values: unknown[] = [];
      for (const [col, val] of entries) {
        if (val !== undefined) {
          values.push(val);
          clauses.push(`${col} = $${values.length}`);
        }
      }

      if (clauses.length === 0) {
        return existingResult.rows[0];
      }

      values.push(addressUuid, userId);
      const updatedResult = await client.query<UserAddressRow>(
        `UPDATE user_addresses
         SET ${clauses.join(', ')}
         WHERE address_uuid = $${values.length - 1}
           AND user_id = $${values.length}
         RETURNING ${ADDRESS_COLUMNS}`,
        values
      );

      return updatedResult.rows[0] ?? null;
    });
  },

  async deleteAddressAtomic(userId: number, addressUuid: string) {
    return withTransaction(async (client) => {
      await client.query(`SELECT id FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE`, [
        userId,
      ]);

      const deletedResult = await client.query<{ id: number; is_default: boolean }>(
        `DELETE FROM user_addresses
         WHERE address_uuid = $1
           AND user_id = $2
         RETURNING id, is_default`,
        [addressUuid, userId]
      );

      if (deletedResult.rows.length === 0) {
        return false;
      }

      const wasDefault = deletedResult.rows[0]?.is_default ?? false;
      if (wasDefault) {
        await client.query(
          `UPDATE user_addresses
           SET is_default = TRUE
           WHERE id = (
             SELECT id
             FROM user_addresses
             WHERE user_id = $1
             ORDER BY updated_at DESC, id DESC
             LIMIT 1
           )`,
          [userId]
        );
      }

      return true;
    });
  },
};

export default accountModel;
