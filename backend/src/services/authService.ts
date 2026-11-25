import type { ChangePasswordRequestDto, LoginRequestDto, RegisterRequestDto } from '@yng/shared';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import { toAuthenticatedUser } from '../middleware/auth.js';
import { userModel, type UserRepository } from '../models/userModel.js';
import type { AuthenticatedUser } from '../types/auth.js';

export const GENERIC_LOGIN_ERROR = 'Email atau password salah.';

// ASSUMPTION: hash dummy dihitung sekali saat modul dimuat dengan cost BCRYPT_SALT_ROUNDS (12)
// agar percobaan login untuk email yang tidak terdaftar tetap memakan waktu bcrypt yang setara.
export const DUMMY_PASSWORD_HASH: string = bcrypt.hashSync(
  '__yng_dummy_timing_protection__',
  BCRYPT_SALT_ROUNDS
);

export interface AuthServiceDeps {
  userRepo: UserRepository;
  hashPassword?: (plain: string, saltRounds: number) => Promise<string>;
  comparePassword?: (plain: string, hash: string) => Promise<boolean>;
  saltRounds?: number;
}

export interface AuthService {
  register(input: RegisterRequestDto): Promise<AuthenticatedUser>;
  login(input: LoginRequestDto): Promise<AuthenticatedUser>;
  changePassword(input: ChangePasswordRequestDto & { userId: number }): Promise<AuthenticatedUser>;
}

/**
 * Membuat service autentikasi terpadu (USER & ADMIN) dengan repository terinjeksi.
 */
export function createAuthService(deps: AuthServiceDeps): AuthService {
  const {
    userRepo,
    hashPassword = bcrypt.hash,
    comparePassword = bcrypt.compare,
    saltRounds = BCRYPT_SALT_ROUNDS,
  } = deps;

  return {
    async register(input: RegisterRequestDto): Promise<AuthenticatedUser> {
      const emailLower = input.email.trim().toLowerCase();

      const existing = await userRepo.findByEmail(emailLower);
      if (existing) {
        // ASSUMPTION: pengembalian 409 untuk email duplikat aman karena endpoint dilindungi authRegisterLimiter.
        throw new AppError('Email sudah terdaftar.', 409);
      }

      const passwordHash = await hashPassword(input.password, saltRounds);
      const created = await userRepo.createCustomer({
        fullName: input.fullName.trim(),
        email: emailLower,
        whatsapp: input.whatsapp,
        passwordHash,
      });

      return toAuthenticatedUser(created);
    },

    async login(input: LoginRequestDto): Promise<AuthenticatedUser> {
      const emailLower = input.email.trim().toLowerCase();
      const dbUser = await userRepo.findByEmail(emailLower);

      // Selalu jalankan bcrypt.compare (termasuk ke DUMMY_PASSWORD_HASH) agar timing respons seragam.
      const hashToCompare = dbUser ? dbUser.password_hash : DUMMY_PASSWORD_HASH;
      const isMatch = await comparePassword(input.password, hashToCompare);

      if (!dbUser || !dbUser.is_active || !isMatch) {
        throw new AppError(GENERIC_LOGIN_ERROR, 401);
      }

      await userRepo.updateLastLoginAt(dbUser.id);
      return toAuthenticatedUser(dbUser);
    },

    async changePassword(
      input: ChangePasswordRequestDto & { userId: number }
    ): Promise<AuthenticatedUser> {
      const dbUser = await userRepo.findById(input.userId);
      if (!dbUser || !dbUser.is_active) {
        throw new AppError('Sesi tidak valid atau akun nonaktif.', 401);
      }

      const isCurrentValid = await comparePassword(input.currentPassword, dbUser.password_hash);
      if (!isCurrentValid) {
        throw new AppError('Password lama tidak sesuai.', 400);
      }

      const newPasswordHash = await hashPassword(input.newPassword, saltRounds);
      const updated = await userRepo.updatePasswordAndBumpTokenVersion(dbUser.id, newPasswordHash);
      if (!updated) {
        throw new AppError('Akun tidak ditemukan atau nonaktif.', 401);
      }

      return toAuthenticatedUser(updated);
    },
  };
}

export const authService = createAuthService({ userRepo: userModel });
export default authService;
