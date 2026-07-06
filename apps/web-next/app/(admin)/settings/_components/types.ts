export type UserRole = "admin" | "employee" | "invited";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  tenantId: string;
}

export interface UserListResponse {
  users: User[];
}

export interface UserUpdate {
  role?: UserRole;
  isActive?: boolean;
  name?: string;
}
