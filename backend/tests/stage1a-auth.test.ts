import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { USER_ROLE, type UserRole } from '@yng/shared';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateCustomerUserInput, UserRepository } from '../src/models/userModel.js';
import type { AuthDbUserRow, AuthDbUserWithPasswordRow } from '../src/types/auth.js';

process.env.SKIP_DOTENV = 'true';
process.env.JWT_SECRET = 'test_secret_minimal_32_karakter_12345';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { BCRYPT_SALT_ROUNDS } = await import('../src/config/constants.js');
const { env } = await import('../src/config/env.js');
const { createRequireAuth, signAuthToken } = await import('../src/middleware/auth.js');
const { errorHandler, notFoundHandler } = await import('../src/middleware/errorHandler.js');
const { originCheck } = await import('../src/middleware/originCheck.js');
const { createAdminRouter } = await import('../src/routes/adminRoutes.js');
const { createAuthRouter } = await import('../src/routes/authRoutes.js');
const { createAuthService, DUMMY_PASSWORD_HASH, GENERIC_LOGIN_ERROR } =
  await import('../src/services/authService.js');

interface StoredUser extends AuthDbUserWithPasswordRow {
  role: UserRole;
}

function createInMemoryUserRepo(seedUsers: StoredUser[]) {
  const usersById = new Map<number, StoredUser>();
  let nextId = 1;

  for (const seed of seedUsers) {
    usersById.set(seed.id, { ...seed });
    if (seed.id >= nextId) {
      nextId = seed.id + 1;
    }
  }

  const repo: UserRepository = {
    async findByEmail(emailLower: string): Promise<AuthDbUserWithPasswordRow | null> {
      for (const user of usersById.values()) {
        if (user.email.toLowerCase() === emailLower.toLowerCase()) {
          return { ...user };
        }
      }
      return null;
    },

    async findById(id: number): Promise<AuthDbUserWithPasswordRow | null> {
      const user = usersById.get(id);
      return user ? { ...user } : null;
    },

    async findByUuid(userUuid: string): Promise<AuthDbUserRow | null> {
      for (const user of usersById.values()) {
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
    },

    async createCustomer(input: CreateCustomerUserInput): Promise<AuthDbUserRow> {
      const created: StoredUser = {
        id: nextId++,
        user_uuid: randomUUID(),
        role: USER_ROLE.USER,
        full_name: input.fullName,
        email: input.email.toLowerCase(),
        whatsapp: input.whatsapp,
        password_hash: input.passwordHash,
        is_active: true,
        token_version: 0,
        last_login_at: null,
      };
      usersById.set(created.id, created);
      return {
        id: created.id,
        user_uuid: created.user_uuid,
        role: created.role,
        full_name: created.full_name,
        email: created.email,
        whatsapp: created.whatsapp,
        is_active: created.is_active,
        token_version: created.token_version,
      };
    },

    async updateLastLoginAt(id: number): Promise<void> {
      const user = usersById.get(id);
      if (user) {
        user.last_login_at = new Date().toISOString();
      }
    },

    async updatePasswordAndBumpTokenVersion(
      id: number,
      newPasswordHash: string
    ): Promise<AuthDbUserRow | null> {
      const user = usersById.get(id);
      if (!user || !user.is_active) {
        return null;
      }
      user.password_hash = newPasswordHash;
      user.token_version += 1;
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
  };

  return { repo, usersById };
}

function extractCookieToken(setCookies: string[], cookieName: string): string | null {
  for (const cookie of setCookies) {
    const match = new RegExp(`^${cookieName}=([^;]+)`).exec(cookie);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

function extractCookieHeader(setCookies: string[], cookieName: string): string | null {
  for (const cookie of setCookies) {
    if (cookie.startsWith(`${cookieName}=`)) {
      return cookie;
    }
  }
  return null;
}

describe('Tahap 1a-1 — Auth Terpadu (USER & ADMIN), Keamanan Cookie/JWT, & Guard Admin', () => {
  let server: http.Server;
  let baseUrl: string;
  let usersById: Map<number, StoredUser>;
  let compareSpy: ReturnType<typeof vi.fn<(plain: string, hash: string) => Promise<boolean>>>;

  const ADMIN_UUID = '11111111-1111-4111-8111-111111111111';
  const USER_UUID = '22222222-2222-4222-8222-222222222222';
  const INACTIVE_UUID = '33333333-3333-4333-8333-333333333333';

  let initialAdminHash: string;
  let initialUserHash: string;
  let initialInactiveHash: string;

  beforeAll(async () => {
    initialAdminHash = await bcrypt.hash('AdminRahasia#2026', BCRYPT_SALT_ROUNDS);
    initialUserHash = await bcrypt.hash('UserRahasia#2026', BCRYPT_SALT_ROUNDS);
    initialInactiveHash = await bcrypt.hash('Nonaktif#2026', BCRYPT_SALT_ROUNDS);

    const store = createInMemoryUserRepo([
      {
        id: 1,
        user_uuid: ADMIN_UUID,
        role: USER_ROLE.ADMIN,
        full_name: 'Owner YNG',
        email: 'owner@yngapparel.id',
        whatsapp: null,
        password_hash: initialAdminHash,
        is_active: true,
        token_version: 2,
        last_login_at: null,
      },
      {
        id: 2,
        user_uuid: USER_UUID,
        role: USER_ROLE.USER,
        full_name: 'Pelanggan Uji',
        email: 'pelanggan@gmail.com',
        whatsapp: '6281234567890',
        password_hash: initialUserHash,
        is_active: true,
        token_version: 0,
        last_login_at: null,
      },
      {
        id: 3,
        user_uuid: INACTIVE_UUID,
        role: USER_ROLE.USER,
        full_name: 'Akun Nonaktif',
        email: 'nonaktif@gmail.com',
        whatsapp: '6281234567891',
        password_hash: initialInactiveHash,
        is_active: false,
        token_version: 0,
        last_login_at: null,
      },
    ]);
    usersById = store.usersById;

    compareSpy = vi.fn((plain: string, hash: string) => bcrypt.compare(plain, hash));

    const testAuthService = createAuthService({
      userRepo: store.repo,
      comparePassword: compareSpy,
      saltRounds: BCRYPT_SALT_ROUNDS,
    });

    const reqAuth = createRequireAuth((uuid) => store.repo.findByUuid(uuid));
    const adminRouter = createAdminRouter(reqAuth);
    adminRouter.get('/probe', (_req, res) => {
      res.json({ success: true, message: 'Admin OK', data: { ok: true } });
    });

    const testApp = express();
    testApp.use(cookieParser());
    testApp.use(express.json());
    testApp.use('/api', originCheck);
    testApp.use(
      '/api/auth',
      createAuthRouter({
        authService: testAuthService,
        requireAuthMiddleware: reqAuth,
        // Pasang no-op limiter pada suite fungsional; rate limiter asli diuji di suite terpisah di bawah.
        loginLimiter: (_req, _res, next) => next(),
        registerLimiter: (_req, _res, next) => next(),
      })
    );
    testApp.use('/api/admin', adminRouter);
    testApp.use(notFoundHandler);
    testApp.use(errorHandler);

    server = http.createServer(testApp);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    compareSpy.mockClear();
  });

  it('DUMMY_PASSWORD_HASH adalah konstanta bcrypt cost BCRYPT_SALT_ROUNDS yang dihitung sekali', () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_SALT_ROUNDS}\\$`));
    expect(DUMMY_PASSWORD_HASH).toHaveLength(60);
  });

  it('POST /api/auth/register selalu membuat role USER (abaikan role=ADMIN), menormalisasi WA & email, dan tidak menyetel cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: '  Siti Aminah  ',
        email: '  Siti.Aminah@Gmail.COM ',
        whatsapp: '0812-9876-5432',
        password: 'PasswordKuat#1',
        role: USER_ROLE.ADMIN,
      }),
    });

    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie()).toHaveLength(0);

    const json = (await res.json()) as {
      success: boolean;
      message: string;
      data: Record<string, unknown>;
    };
    expect(json.success).toBe(true);
    expect(json.data.role).toBe(USER_ROLE.USER);
    expect(json.data.email).toBe('siti.aminah@gmail.com');
    expect(json.data.fullName).toBe('Siti Aminah');
    expect(json.data.whatsapp).toBe('6281298765432');
    expect(json.data.userUuid).toBeTypeOf('string');
    expect(json.data.id).toBeUndefined();
    expect(json.data.password_hash).toBeUndefined();
    expect(json.data.passwordHash).toBeUndefined();

    // Duplikat email (beda huruf besar/kecil) ditolak 409
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Duplikat',
        email: 'SITI.AMINAH@gmail.com',
        whatsapp: '081298765433',
        password: 'PasswordKuat#2',
      }),
    });
    expect(dupRes.status).toBe(409);
  });

  it('POST /api/auth/register menolak password < 8 karakter, > 72 byte UTF-8 (ASCII & multi-byte), dan WA invalid, tetapi menerima tepat 72 byte', async () => {
    const shortRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Uji Pendek',
        email: 'pendek@gmail.com',
        whatsapp: '081234567890',
        password: '1234567',
      }),
    });
    expect(shortRes.status).toBe(400);

    const longAsciiRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Uji Panjang',
        email: 'panjang@gmail.com',
        whatsapp: '081234567890',
        password: 'a'.repeat(73),
      }),
    });
    expect(longAsciiRes.status).toBe(400);

    // 19 emoji = 19 karakter, namun 76 byte UTF-8 (> 72 byte)
    const multiByteRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Uji Emoji',
        email: 'emoji@gmail.com',
        whatsapp: '081234567890',
        password: '🔐'.repeat(19),
      }),
    });
    expect(multiByteRes.status).toBe(400);

    const invalidWaRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Uji WA',
        email: 'wainvalid@gmail.com',
        whatsapp: '123',
        password: 'PasswordValid123',
      }),
    });
    expect(invalidWaRes.status).toBe(400);

    // 36 karakter 'é' = 72 byte UTF-8 persis -> diterima
    const exact72Res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Uji Tepat 72 Byte',
        email: 'tepat72@gmail.com',
        whatsapp: '081234567899',
        password: 'é'.repeat(36),
      }),
    });
    expect(exact72Res.status).toBe(201);
  });

  it('POST /api/auth/login menerbitkan cookie httpOnly berisi sub=user_uuid untuk USER & ADMIN, serta memakai error generik + DUMMY_PASSWORD_HASH', async () => {
    // 1. Login USER (case-insensitive email)
    const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'PELANGGAN@Gmail.COM',
        password: 'UserRahasia#2026',
      }),
    });
    expect(userLoginRes.status).toBe(200);
    const userSetCookies = userLoginRes.headers.getSetCookie();
    const userCookieHeader = extractCookieHeader(userSetCookies, env.cookieName);
    expect(userCookieHeader).toContain('HttpOnly');
    const userToken = extractCookieToken(userSetCookies, env.cookieName);
    expect(userToken).toBeTruthy();

    const decodedUserJwt = jwt.verify(userToken!, env.jwtSecret) as Record<string, unknown>;
    expect(decodedUserJwt.sub).toBe(USER_UUID);
    expect(decodedUserJwt.role).toBe(USER_ROLE.USER);
    expect(decodedUserJwt.token_version).toBe(0);
    expect(decodedUserJwt.id).toBeUndefined();
    expect(usersById.get(2)?.last_login_at).not.toBeNull();

    // 2. Login ADMIN melalui endpoint yang sama
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'OWNER@YNGAPPAREL.ID',
        password: 'AdminRahasia#2026',
      }),
    });
    expect(adminLoginRes.status).toBe(200);
    const adminBody = (await adminLoginRes.json()) as { data: Record<string, unknown> };
    expect(adminBody.data.role).toBe(USER_ROLE.ADMIN);
    expect(adminBody.data.userUuid).toBe(ADMIN_UUID);
    expect(adminBody.data.id).toBeUndefined();
    expect(usersById.get(1)?.last_login_at).not.toBeNull();

    // 3. Email tidak ada -> error generik & tetap menjalankan bcrypt.compare dengan DUMMY_PASSWORD_HASH
    compareSpy.mockClear();
    const unknownEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tidakada@gmail.com',
        password: 'ApaSajaPassword123',
      }),
    });
    expect(unknownEmailRes.status).toBe(401);
    const unknownEmailJson = (await unknownEmailRes.json()) as { message: string };
    expect(unknownEmailJson.message).toBe(GENERIC_LOGIN_ERROR);
    expect(compareSpy).toHaveBeenCalledTimes(1);
    expect(compareSpy).toHaveBeenCalledWith('ApaSajaPassword123', DUMMY_PASSWORD_HASH);

    // 4. Password salah -> pesan error generik yang persis sama
    const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pelanggan@gmail.com',
        password: 'SalahPassword123',
      }),
    });
    expect(wrongPassRes.status).toBe(401);
    const wrongPassJson = (await wrongPassRes.json()) as { message: string };
    expect(wrongPassJson.message).toBe(GENERIC_LOGIN_ERROR);

    // 5. Akun nonaktif -> pesan error generik yang persis sama & last_login_at tetap null
    const inactiveRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonaktif@gmail.com',
        password: 'Nonaktif#2026',
      }),
    });
    expect(inactiveRes.status).toBe(401);
    const inactiveJson = (await inactiveRes.json()) as { message: string };
    expect(inactiveJson.message).toBe(GENERIC_LOGIN_ERROR);
    expect(usersById.get(3)?.last_login_at).toBeNull();

    // 6. Password > 72 byte saat login ditolak 400
    const overByteLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pelanggan@gmail.com',
        password: 'x'.repeat(73),
      }),
    });
    expect(overByteLoginRes.status).toBe(400);
  });

  it('GET /api/auth/me dan /api/admin/* menegakkan Auth, is_active, token_version, dan RBAC dari DB', async () => {
    // Guest ke rute terlindungi -> 401
    expect((await fetch(`${baseUrl}/api/auth/me`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/admin/probe`)).status).toBe(401);

    // USER valid -> /me 200 (tanpa id & password_hash) & /admin/probe 403
    const userToken = signAuthToken({
      userUuid: USER_UUID,
      role: USER_ROLE.USER,
      tokenVersion: 0,
    });
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: `${env.cookieName}=${userToken}` },
    });
    expect(meRes.status).toBe(200);
    expect(meRes.headers.get('cache-control')).toBe('no-store');
    const meJson = (await meRes.json()) as { data: Record<string, unknown> };
    expect(meJson.data).toEqual({
      userUuid: USER_UUID,
      fullName: 'Pelanggan Uji',
      email: 'pelanggan@gmail.com',
      whatsapp: '6281234567890',
      role: USER_ROLE.USER,
    });
    expect(meJson.data.id).toBeUndefined();
    expect(meJson.data.password_hash).toBeUndefined();

    // USER membawa klaim JWT role=ADMIN palsu tetap ditolak 403 di rute admin
    const spoofedUserToken = signAuthToken({
      userUuid: USER_UUID,
      role: USER_ROLE.ADMIN,
      tokenVersion: 0,
    });
    const forbiddenAdminRes = await fetch(`${baseUrl}/api/admin/probe`, {
      headers: { Cookie: `${env.cookieName}=${spoofedUserToken}` },
    });
    expect(forbiddenAdminRes.status).toBe(403);

    // ADMIN valid -> 200 di rute admin
    const adminToken = signAuthToken({
      userUuid: ADMIN_UUID,
      role: USER_ROLE.ADMIN,
      tokenVersion: 2,
    });
    const okAdminRes = await fetch(`${baseUrl}/api/admin/probe`, {
      headers: { Cookie: `${env.cookieName}=${adminToken}` },
    });
    expect(okAdminRes.status).toBe(200);

    // User nonaktif -> 401
    const inactiveToken = signAuthToken({
      userUuid: INACTIVE_UUID,
      role: USER_ROLE.USER,
      tokenVersion: 0,
    });
    expect(
      (
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Cookie: `${env.cookieName}=${inactiveToken}` },
        })
      ).status
    ).toBe(401);

    // token_version lama -> 401
    const staleAdminToken = signAuthToken({
      userUuid: ADMIN_UUID,
      role: USER_ROLE.ADMIN,
      tokenVersion: 1,
    });
    expect(
      (
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Cookie: `${env.cookieName}=${staleAdminToken}` },
        })
      ).status
    ).toBe(401);
  });

  it('POST /api/auth/logout bersifat idempoten (tanpa requireAuth): selalu hapus cookie dan balas 200', async () => {
    // 1. User login valid
    const validToken = signAuthToken({
      userUuid: USER_UUID,
      role: USER_ROLE.USER,
      tokenVersion: 0,
    });
    const resValid = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${env.cookieName}=${validToken}` },
    });
    expect(resValid.status).toBe(200);
    expect(resValid.headers.getSetCookie().some((c) => c.startsWith(`${env.cookieName}=;`))).toBe(
      true
    );

    // 2. Guest tanpa cookie
    const resGuest = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
    });
    expect(resGuest.status).toBe(200);
    expect(resGuest.headers.getSetCookie().some((c) => c.startsWith(`${env.cookieName}=;`))).toBe(
      true
    );

    // 3. Token tidak valid / corrupt
    const resCorrupt = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${env.cookieName}=bukan.jwt.valid` },
    });
    expect(resCorrupt.status).toBe(200);
    expect(resCorrupt.headers.getSetCookie().some((c) => c.startsWith(`${env.cookieName}=;`))).toBe(
      true
    );

    // 4. Token JWT kedaluwarsa
    const expiredToken = jwt.sign(
      { sub: USER_UUID, role: USER_ROLE.USER, token_version: 0 },
      env.jwtSecret,
      { algorithm: 'HS256', expiresIn: -10 }
    );
    const resExpired = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${env.cookieName}=${expiredToken}` },
    });
    expect(resExpired.status).toBe(200);
    expect(resExpired.headers.getSetCookie().some((c) => c.startsWith(`${env.cookieName}=;`))).toBe(
      true
    );
  });

  it('PUT /api/auth/password mewajibkan password lama, menaikkan token_version, mencabut sesi lama, dan menerbitkan cookie baru', async () => {
    // Guest -> 401
    const guestPwRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'UserRahasia#2026',
        newPassword: 'PasswordBaru#2026',
      }),
    });
    expect(guestPwRes.status).toBe(401);

    // Login terlebih dulu untuk memperoleh token versi 0
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pelanggan@gmail.com',
        password: 'UserRahasia#2026',
      }),
    });
    const oldToken = extractCookieToken(loginRes.headers.getSetCookie(), env.cookieName)!;

    // Password lama salah -> 400 & token_version tetap 0
    const wrongOldRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${env.cookieName}=${oldToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'PasswordLamaSalah',
        newPassword: 'PasswordBaru#2026',
      }),
    });
    expect(wrongOldRes.status).toBe(400);
    expect(usersById.get(2)?.token_version).toBe(0);

    // Password baru > 72 byte -> 400
    const overByteNewRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${env.cookieName}=${oldToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'UserRahasia#2026',
        newPassword: 'z'.repeat(73),
      }),
    });
    expect(overByteNewRes.status).toBe(400);

    // Ganti password sukses -> token_version naik jadi 1 + cookie baru terbit
    const changeOkRes = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${env.cookieName}=${oldToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'UserRahasia#2026',
        newPassword: 'PasswordBaru#2026',
      }),
    });
    expect(changeOkRes.status).toBe(200);
    expect(usersById.get(2)?.token_version).toBe(1);

    const newToken = extractCookieToken(changeOkRes.headers.getSetCookie(), env.cookieName);
    expect(newToken).toBeTruthy();
    const decodedNew = jwt.verify(newToken!, env.jwtSecret) as Record<string, unknown>;
    expect(decodedNew.token_version).toBe(1);

    // Sesi lama ditolak 401, sesi baru tetap diterima 200
    expect(
      (
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Cookie: `${env.cookieName}=${oldToken}` },
        })
      ).status
    ).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Cookie: `${env.cookieName}=${newToken}` },
        })
      ).status
    ).toBe(200);
  });
});

describe('Tahap 1a-1 — Rate Limiter Login & Register', () => {
  let limitServer: http.Server;
  let limitBaseUrl: string;

  beforeAll(async () => {
    const store = createInMemoryUserRepo([]);
    const testAuthService = createAuthService({
      userRepo: store.repo,
      saltRounds: BCRYPT_SALT_ROUNDS,
    });

    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/auth', createAuthRouter({ authService: testAuthService }));
    app.use(errorHandler);

    limitServer = http.createServer(app);
    await new Promise<void>((resolve) => {
      limitServer.listen(0, '127.0.0.1', () => resolve());
    });
    limitBaseUrl = `http://127.0.0.1:${(limitServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      limitServer.close(() => resolve());
    });
  });

  it('authLoginLimiter dan authRegisterLimiter membalas 429 setelah batas terlampaui', async () => {
    // 10 request pertama masuk (ditolak 400 oleh validasi, belum 429), request ke-11 -> 429
    for (let i = 0; i < 10; i += 1) {
      const res = await fetch(`${limitBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    }

    const limitedLoginRes = await fetch(`${limitBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(limitedLoginRes.status).toBe(429);
    const loginLimitJson = (await limitedLoginRes.json()) as {
      success: boolean;
      data: unknown;
      message: string;
    };
    expect(loginLimitJson.success).toBe(false);
    expect(loginLimitJson.data).toBeNull();
    expect(loginLimitJson.message).toMatch(/login/i);

    for (let i = 0; i < 10; i += 1) {
      const res = await fetch(`${limitBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    }

    const limitedRegisterRes = await fetch(`${limitBaseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(limitedRegisterRes.status).toBe(429);
    const registerLimitJson = (await limitedRegisterRes.json()) as {
      success: boolean;
      data: unknown;
      message: string;
    };
    expect(registerLimitJson.success).toBe(false);
    expect(registerLimitJson.data).toBeNull();
    expect(registerLimitJson.message).toMatch(/pendaftaran/i);
  });
});
