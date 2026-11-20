import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  USER_ROLE,
  type CreateUserAddressDto,
  type UpdateProfileRequestDto,
  type UpdateUserAddressDto,
  type UserRole,
} from '@yng/shared';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountRepository, UserAddressRow } from '../src/models/accountModel.js';
import type { AuthDbUserRow, AuthDbUserWithPasswordRow } from '../src/types/auth.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { BCRYPT_SALT_ROUNDS, USER_MAX_ADDRESSES } = await import('../src/config/constants.js');
const { env } = await import('../src/config/env.js');
const { createRequireAuth, signAuthToken } = await import('../src/middleware/auth.js');
const { AppError, errorHandler, notFoundHandler } =
  await import('../src/middleware/errorHandler.js');
const { originCheck } = await import('../src/middleware/originCheck.js');
const { createAccountRouter } = await import('../src/routes/accountRoutes.js');
const { createAuthRouter } = await import('../src/routes/authRoutes.js');
const { createAccountService } = await import('../src/services/accountService.js');
const { createAuthService } = await import('../src/services/authService.js');

interface StoredUser extends AuthDbUserWithPasswordRow {
  role: UserRole;
}

function createInMemoryAccountStore(seedUsers: StoredUser[]) {
  const users = new Map<number, StoredUser>();
  const addresses = new Map<number, UserAddressRow>();
  let addressIdSeq = 1;

  for (const user of seedUsers) {
    users.set(user.id, { ...user });
  }

  const now = () => new Date().toISOString();

  const findUserByUuid = async (userUuid: string): Promise<AuthDbUserRow | null> => {
    for (const user of users.values()) {
      if (user.user_uuid === userUuid) {
        return {
          id: user.id,
          user_uuid: user.user_uuid,
          role: user.role,
          full_name: user.full_name,
          email: user.email,
          whatsapp: user.whatsapp,
          is_active: user.is_active,
          token_version: user.token_version,
        };
      }
    }
    return null;
  };

  const accountRepo: AccountRepository = {
    async findUserWithPasswordById(userId) {
      const user = users.get(userId);
      return user ? { ...user } : null;
    },

    async updateUserProfile(userId, patch: UpdateProfileRequestDto) {
      const user = users.get(userId);
      if (!user || !user.is_active) return null;
      if (patch.fullName !== undefined) user.full_name = patch.fullName;
      if (patch.whatsapp !== undefined) user.whatsapp = patch.whatsapp;
      return {
        id: user.id,
        user_uuid: user.user_uuid,
        role: user.role,
        full_name: user.full_name,
        email: user.email,
        whatsapp: user.whatsapp,
        is_active: user.is_active,
        token_version: user.token_version,
      };
    },

    async deactivateCustomerAccount(userId) {
      const user = users.get(userId);
      if (!user || user.role !== USER_ROLE.USER || !user.is_active) {
        return false;
      }
      user.is_active = false;
      user.token_version += 1;
      return true;
    },

    async listAddressesByUser(userId) {
      return [...addresses.values()]
        .filter((addr) => addr.user_id === userId)
        .sort((a, b) => Number(b.is_default) - Number(a.is_default) || b.id - a.id)
        .map((addr) => ({ ...addr }));
    },

    async createAddressAtomic(userId, input: CreateUserAddressDto, maxAddresses) {
      const owned = [...addresses.values()].filter((addr) => addr.user_id === userId);
      if (owned.length >= maxAddresses) {
        throw new AppError(`Maksimal ${maxAddresses} alamat tersimpan per akun.`, 400);
      }

      const effectiveDefault = owned.length === 0 ? true : Boolean(input.isDefault);
      if (effectiveDefault) {
        for (const addr of owned) {
          if (addr.is_default) {
            addr.is_default = false;
          }
        }
      }

      const created: UserAddressRow = {
        id: addressIdSeq++,
        address_uuid: randomUUID(),
        user_id: userId,
        label: input.label,
        recipient_name: input.recipientName,
        recipient_whatsapp: input.recipientWhatsapp,
        province_name: input.provinceName,
        city_name: input.cityName,
        district_name: input.districtName,
        postal_code: input.postalCode,
        full_address: input.fullAddress,
        is_default: effectiveDefault,
        created_at: now(),
        updated_at: now(),
      };
      addresses.set(created.id, created);
      return { ...created };
    },

    async updateAddressAtomic(userId, addressUuid, patch: UpdateUserAddressDto) {
      const target = [...addresses.values()].find(
        (addr) => addr.address_uuid === addressUuid && addr.user_id === userId
      );
      if (!target) return null;

      if (patch.isDefault === true) {
        for (const addr of addresses.values()) {
          if (addr.user_id === userId && addr.address_uuid !== addressUuid) {
            addr.is_default = false;
          }
        }
      }

      target.label = patch.label ?? target.label;
      target.recipient_name = patch.recipientName ?? target.recipient_name;
      target.recipient_whatsapp = patch.recipientWhatsapp ?? target.recipient_whatsapp;
      target.province_name = patch.provinceName ?? target.province_name;
      target.city_name = patch.cityName ?? target.city_name;
      target.district_name = patch.districtName ?? target.district_name;
      target.postal_code = patch.postalCode ?? target.postal_code;
      target.full_address = patch.fullAddress ?? target.full_address;
      target.is_default = patch.isDefault ?? target.is_default;
      target.updated_at = now();

      return { ...target };
    },

    async deleteAddressAtomic(userId, addressUuid) {
      const target = [...addresses.values()].find(
        (addr) => addr.address_uuid === addressUuid && addr.user_id === userId
      );
      if (!target) return false;

      addresses.delete(target.id);
      if (target.is_default) {
        const remaining = [...addresses.values()]
          .filter((addr) => addr.user_id === userId)
          .sort((a, b) => b.id - a.id);
        if (remaining[0]) {
          remaining[0].is_default = true;
        }
      }
      return true;
    },
  };

  return { users, addresses, findUserByUuid, accountRepo };
}

function sampleAddress(idx: number, isDefault?: boolean) {
  return {
    label: `Alamat ${idx}`,
    recipientName: `Penerima ${idx}`,
    recipientWhatsapp: `0812-0000-000${idx}`,
    provinceName: 'Kepulauan Riau',
    cityName: 'Kota Batam',
    districtName: 'Batam Kota',
    postalCode: '29464',
    fullAddress: `Jl. Engku Putri No. ${idx}, Batam Centre`,
    ...(isDefault !== undefined ? { isDefault } : {}),
  };
}

describe('Tahap 1b — Akun Pelanggan, Alamat Tersimpan (Maks 5 & Isolasi User), & Nonaktifkan Akun', () => {
  const ADMIN_UUID = '11111111-1111-4111-8111-111111111111';
  const USER_A_UUID = '22222222-2222-4222-8222-222222222222';
  const USER_B_UUID = '44444444-4444-4444-8444-444444444444';

  let server: http.Server;
  let baseUrl: string;
  let users: Map<number, StoredUser>;
  let adminCookie: string;
  let userACookie: string;
  let userBCookie: string;

  beforeAll(async () => {
    const adminHash = await bcrypt.hash('AdminPass#2026', BCRYPT_SALT_ROUNDS);
    const userAHash = await bcrypt.hash('UserAPass#2026', BCRYPT_SALT_ROUNDS);
    const userBHash = await bcrypt.hash('UserBPass#2026', BCRYPT_SALT_ROUNDS);

    const store = createInMemoryAccountStore([
      {
        id: 1,
        user_uuid: ADMIN_UUID,
        role: USER_ROLE.ADMIN,
        full_name: 'Owner YNG',
        email: 'owner@yngapparel.id',
        whatsapp: null,
        password_hash: adminHash,
        is_active: true,
        token_version: 0,
        last_login_at: null,
      },
      {
        id: 2,
        user_uuid: USER_A_UUID,
        role: USER_ROLE.USER,
        full_name: 'Pelanggan Alpha',
        email: 'alpha@gmail.com',
        whatsapp: '6281211111111',
        password_hash: userAHash,
        is_active: true,
        token_version: 0,
        last_login_at: null,
      },
      {
        id: 3,
        user_uuid: USER_B_UUID,
        role: USER_ROLE.USER,
        full_name: 'Pelanggan Beta',
        email: 'beta@gmail.com',
        whatsapp: '6281222222222',
        password_hash: userBHash,
        is_active: true,
        token_version: 0,
        last_login_at: null,
      },
    ]);

    users = store.users;
    const reqAuth = createRequireAuth(store.findUserByUuid);
    const acctService = createAccountService({
      accountRepo: store.accountRepo,
      maxAddresses: USER_MAX_ADDRESSES,
    });
    const stubAuthService = createAuthService({
      userRepo: {
        findByEmail: async () => null,
        findById: async (id) => store.accountRepo.findUserWithPasswordById(id),
        findByUuid: store.findUserByUuid,
        createCustomer: async () => {
          throw new Error('unused');
        },
        updateLastLoginAt: async () => {},
        updatePasswordAndBumpTokenVersion: async () => null,
      },
    });

    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api', originCheck);
    app.use(
      '/api/auth',
      createAuthRouter({
        authService: stubAuthService,
        requireAuthMiddleware: reqAuth,
      })
    );
    app.use(
      '/api/me',
      createAccountRouter({
        accountService: acctService,
        requireAuthMiddleware: reqAuth,
      })
    );
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    adminCookie = `${env.cookieName}=${signAuthToken({
      userUuid: ADMIN_UUID,
      role: USER_ROLE.ADMIN,
      tokenVersion: 0,
    })}`;
    userACookie = `${env.cookieName}=${signAuthToken({
      userUuid: USER_A_UUID,
      role: USER_ROLE.USER,
      tokenVersion: 0,
    })}`;
    userBCookie = `${env.cookieName}=${signAuthToken({
      userUuid: USER_B_UUID,
      role: USER_ROLE.USER,
      tokenVersion: 0,
    })}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('menolak Guest (401) pada seluruh endpoint /api/me/*', async () => {
    expect((await fetch(`${baseUrl}/api/me/addresses`)).status).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}/api/me/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: 'Tamu' }),
        })
      ).status
    ).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}/api/me/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: 'apa' }),
        })
      ).status
    ).toBe(401);
  });

  it('PUT /api/me/profile memperbarui nama & normalisasi WA, menolak field asing/role & null WA untuk USER', async () => {
    // Field asing (role) ditolak 400 oleh .strict()
    expect(
      (
        await fetch(`${baseUrl}/api/me/profile`, {
          method: 'PUT',
          headers: { Cookie: userACookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: 'Hack', role: USER_ROLE.ADMIN }),
        })
      ).status
    ).toBe(400);

    // USER tidak boleh mengosongkan WhatsApp
    expect(
      (
        await fetch(`${baseUrl}/api/me/profile`, {
          method: 'PUT',
          headers: { Cookie: userACookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ whatsapp: null }),
        })
      ).status
    ).toBe(400);

    // Update valid untuk USER
    const okRes = await fetch(`${baseUrl}/api/me/profile`, {
      method: 'PUT',
      headers: { Cookie: userACookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Pelanggan Alpha Baru',
        whatsapp: '0812-3333-4444',
      }),
    });
    expect(okRes.status).toBe(200);
    const okJson = (await okRes.json()) as { data: Record<string, unknown> };
    expect(okJson.data.fullName).toBe('Pelanggan Alpha Baru');
    expect(okJson.data.whatsapp).toBe('6281233334444');
    expect(okJson.data.id).toBeUndefined();
    expect(okJson.data.password_hash).toBeUndefined();

    // ADMIN boleh memperbarui nama dengan whatsapp tetap null
    const adminRes = await fetch(`${baseUrl}/api/me/profile`, {
      method: 'PUT',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Owner YNG Studio', whatsapp: null }),
    });
    expect(adminRes.status).toBe(200);
  });

  it('CRUD /api/me/addresses menegakkan maks 5 alamat, 1 alamat utama, validasi strict, & isolasi data (404 milik orang lain)', async () => {
    // User B membuat 1 alamat terlebih dahulu
    const bCreateRes = await fetch(`${baseUrl}/api/me/addresses`, {
      method: 'POST',
      headers: { Cookie: userBCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleAddress(1)),
    });
    expect(bCreateRes.status).toBe(201);
    const bAddr = ((await bCreateRes.json()) as { data: Record<string, unknown> }).data as {
      addressUuid: string;
      recipientWhatsapp: string;
      isDefault: boolean;
      id?: unknown;
      userId?: unknown;
    };
    expect(bAddr.isDefault).toBe(true);
    expect(bAddr.recipientWhatsapp).toBe('6281200000001');
    expect(bAddr.id).toBeUndefined();
    expect(bAddr.userId).toBeUndefined();

    // User A mengakses alamat milik User B -> wajib 404 (isolasi ketat)
    expect(
      (
        await fetch(`${baseUrl}/api/me/addresses/${bAddr.addressUuid}`, {
          method: 'PUT',
          headers: { Cookie: userACookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Bajakan' }),
        })
      ).status
    ).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/api/me/addresses/${bAddr.addressUuid}`, {
          method: 'DELETE',
          headers: { Cookie: userACookie },
        })
      ).status
    ).toBe(404);

    // Validasi kode pos bukan 5 digit & field asing -> 400
    expect(
      (
        await fetch(`${baseUrl}/api/me/addresses`, {
          method: 'POST',
          headers: { Cookie: userACookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...sampleAddress(1), postalCode: '123' }),
        })
      ).status
    ).toBe(400);

    // User A membuat 5 alamat (batas maksimal)
    const userAAddressUuids: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const res = await fetch(`${baseUrl}/api/me/addresses`, {
        method: 'POST',
        headers: { Cookie: userACookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleAddress(i)),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { data: { addressUuid: string; isDefault: boolean } };
      userAAddressUuids.push(body.data.addressUuid);
      if (i === 1) {
        expect(body.data.isDefault).toBe(true);
      } else {
        expect(body.data.isDefault).toBe(false);
      }
    }

    // Alamat ke-6 ditolak 400
    const sixthRes = await fetch(`${baseUrl}/api/me/addresses`, {
      method: 'POST',
      headers: { Cookie: userACookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleAddress(6)),
    });
    expect(sixthRes.status).toBe(400);

    // Set alamat ke-3 menjadi utama -> hanya 1 alamat utama milik User A
    const setDefaultRes = await fetch(`${baseUrl}/api/me/addresses/${userAAddressUuids[2]}`, {
      method: 'PUT',
      headers: { Cookie: userACookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true, label: 'Kantor Utama' }),
    });
    expect(setDefaultRes.status).toBe(200);

    const listARes = await fetch(`${baseUrl}/api/me/addresses`, {
      headers: { Cookie: userACookie },
    });
    const listA = (
      (await listARes.json()) as {
        data: Array<{ addressUuid: string; isDefault: boolean; label: string }>;
      }
    ).data;
    expect(listA).toHaveLength(5);
    expect(listA.some((addr) => addr.addressUuid === bAddr.addressUuid)).toBe(false);
    expect(listA.filter((addr) => addr.isDefault)).toHaveLength(1);
    expect(listA.find((addr) => addr.addressUuid === userAAddressUuids[2])?.isDefault).toBe(true);

    // Hapus alamat utama (alamat ke-3) -> alamat lain otomatis dipromosikan jadi utama
    const delDefaultRes = await fetch(`${baseUrl}/api/me/addresses/${userAAddressUuids[2]}`, {
      method: 'DELETE',
      headers: { Cookie: userACookie },
    });
    expect(delDefaultRes.status).toBe(200);

    const listAfterDel = (
      (await (
        await fetch(`${baseUrl}/api/me/addresses`, { headers: { Cookie: userACookie } })
      ).json()) as { data: Array<{ isDefault: boolean }> }
    ).data;
    expect(listAfterDel).toHaveLength(4);
    expect(listAfterDel.filter((addr) => addr.isDefault)).toHaveLength(1);

    // Pastikan alamat User B tetap utuh tidak tersentuh
    const listB = (
      (await (
        await fetch(`${baseUrl}/api/me/addresses`, { headers: { Cookie: userBCookie } })
      ).json()) as { data: Array<{ addressUuid: string; label: string }> }
    ).data;
    expect(listB).toHaveLength(1);
    expect(listB[0]?.label).toBe('Alamat 1');
  });

  it('POST /api/me/deactivate menonaktifkan akun (is_active=FALSE, token_version+1), mencabut cookie & sesi lama (401), dan menolak ADMIN (403)', async () => {
    // ADMIN ditolak 403
    expect(
      (
        await fetch(`${baseUrl}/api/me/deactivate`, {
          method: 'POST',
          headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: 'AdminPass#2026' }),
        })
      ).status
    ).toBe(403);
    expect(users.get(1)?.is_active).toBe(true);

    // Password salah -> 400 & akun tetap aktif
    expect(
      (
        await fetch(`${baseUrl}/api/me/deactivate`, {
          method: 'POST',
          headers: { Cookie: userBCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: 'PasswordSalah123' }),
        })
      ).status
    ).toBe(400);
    expect(users.get(3)?.is_active).toBe(true);

    // Password benar -> 200, is_active=false, token_version naik, cookie terhapus
    const deactivateRes = await fetch(`${baseUrl}/api/me/deactivate`, {
      method: 'POST',
      headers: { Cookie: userBCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'UserBPass#2026' }),
    });
    expect(deactivateRes.status).toBe(200);
    expect(
      deactivateRes.headers.getSetCookie().some((c) => c.startsWith(`${env.cookieName}=;`))
    ).toBe(true);

    const userBRecord = users.get(3);
    expect(userBRecord).toBeDefined();
    expect(userBRecord?.is_active).toBe(false);
    expect(userBRecord?.token_version).toBe(1);

    // Request berikutnya dengan cookie lama User B ditolak 401
    expect(
      (
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Cookie: userBCookie },
        })
      ).status
    ).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}/api/me/addresses`, {
          headers: { Cookie: userBCookie },
        })
      ).status
    ).toBe(401);
  });
});
