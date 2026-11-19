import type { AdminUserDto } from '@yng/shared';

declare global {
  namespace Express {
    interface Request {
      admin?: AdminUserDto;
    }
  }
}

export {};
