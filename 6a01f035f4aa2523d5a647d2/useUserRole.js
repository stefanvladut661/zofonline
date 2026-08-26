import { useAuth } from '@/lib/AuthContext';

export function useUserRole() {
  const { user } = useAuth();
  const role = user?.role || 'user';
  const isAdmin = role === 'admin';
  const assignedLocation = user?.assigned_location || null;

  return { user, role, isAdmin, assignedLocation };
}