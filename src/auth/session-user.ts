import { Role } from '../shared/domain/enums';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}
