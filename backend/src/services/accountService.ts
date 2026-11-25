import {
  USER_ROLE,
  type AuthUserDto,
  type CreateUserAddressDto,
  type UpdateProfileRequestDto,
  type UpdateUserAddressDto,
  type UserAddressDto,
} from '@yng/shared';
import bcrypt from 'bcrypt';
import { USER_MAX_ADDRESSES } from '../config/constants.js';
import { toAuthenticatedUser, toAuthUserDto } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import accountModel, {
  type AccountRepository,
  type UserAddressRow,
} from '../models/accountModel.js';
import type { AuthenticatedUser } from '../types/auth.js';

export interface AccountServiceDeps {
  accountRepo: AccountRepository;
  comparePassword?: (plain: string, hash: string) => Promise<boolean>;
  maxAddresses?: number;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

// Jangan pernah mengekspos id internal (id, user_id) ke respons API publik/pelanggan.
function toUserAddressDto(row: UserAddressRow): UserAddressDto {
  return {
    addressUuid: row.address_uuid,
    label: row.label,
    recipientName: row.recipient_name,
    recipientWhatsapp: row.recipient_whatsapp,
    provinceName: row.province_name,
    cityName: row.city_name,
    districtName: row.district_name,
    postalCode: row.postal_code,
    fullAddress: row.full_address,
    isDefault: row.is_default,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

/**
 * Membuat service manajemen profil, nonaktifkan akun, dan alamat tersimpan milik user aktif.
 */
export function createAccountService(deps: AccountServiceDeps) {
  const { accountRepo, comparePassword = bcrypt.compare, maxAddresses = USER_MAX_ADDRESSES } = deps;

  return {
    async updateProfile(
      user: AuthenticatedUser,
      patch: UpdateProfileRequestDto
    ): Promise<AuthUserDto> {
      if (user.role === USER_ROLE.USER && patch.whatsapp === null) {
        throw new AppError('Nomor WhatsApp wajib diisi untuk akun pelanggan.', 400);
      }

      const updated = await accountRepo.updateUserProfile(user.id, patch);
      if (!updated) {
        throw new AppError('Akun tidak ditemukan atau sudah dinonaktifkan.', 401);
      }

      return toAuthUserDto(toAuthenticatedUser(updated));
    },

    async deactivateAccount(user: AuthenticatedUser, currentPassword: string): Promise<void> {
      if (user.role === USER_ROLE.ADMIN) {
        // ASSUMPTION: akun ADMIN tidak boleh dinonaktifkan mandiri lewat UI agar akses operasional tidak terkunci.
        throw new AppError('Akun ADMIN tidak dapat dinonaktifkan melalui halaman akun.', 403);
      }

      const dbUser = await accountRepo.findUserWithPasswordById(user.id);
      if (!dbUser || !dbUser.is_active) {
        throw new AppError('Akun tidak ditemukan atau sudah dinonaktifkan.', 401);
      }

      const isValid = await comparePassword(currentPassword, dbUser.password_hash);
      if (!isValid) {
        throw new AppError('Password saat ini tidak sesuai.', 400);
      }

      const deactivated = await accountRepo.deactivateCustomerAccount(user.id);
      if (!deactivated) {
        throw new AppError('Akun gagal dinonaktifkan atau sudah nonaktif.', 400);
      }
    },

    async listAddresses(userId: number): Promise<UserAddressDto[]> {
      const rows = await accountRepo.listAddressesByUser(userId);
      return rows.map(toUserAddressDto);
    },

    async createAddress(userId: number, input: CreateUserAddressDto): Promise<UserAddressDto> {
      const created = await accountRepo.createAddressAtomic(userId, input, maxAddresses);
      return toUserAddressDto(created);
    },

    async updateAddress(
      userId: number,
      addressUuid: string,
      patch: UpdateUserAddressDto
    ): Promise<UserAddressDto> {
      const updated = await accountRepo.updateAddressAtomic(userId, addressUuid, patch);
      if (!updated) {
        throw new AppError('Alamat tidak ditemukan.', 404);
      }
      return toUserAddressDto(updated);
    },

    async deleteAddress(userId: number, addressUuid: string): Promise<void> {
      const deleted = await accountRepo.deleteAddressAtomic(userId, addressUuid);
      if (!deleted) {
        throw new AppError('Alamat tidak ditemukan.', 404);
      }
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;

export const accountService = createAccountService({
  accountRepo: accountModel,
});

export default accountService;
