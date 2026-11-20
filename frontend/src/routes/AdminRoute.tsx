import { USER_ROLE } from '@yng/shared';
import ProtectedRoute from './ProtectedRoute';

export default function AdminRoute() {
  return <ProtectedRoute role={USER_ROLE.ADMIN} />;
}
