import type { User } from '../domain/model/User';
import { RedisUserBalanceRepository } from '../infrastructure/persistence/RedisUserBalanceRepository';

export interface UserServiceDeps {
  redisUrl: string;
}

export class UserService {
  private readonly repo: RedisUserBalanceRepository;

  constructor(private readonly deps: UserServiceDeps) {
    this.repo = new RedisUserBalanceRepository(deps.redisUrl);
  }

  async register(name: string, userId?: string): Promise<User> {
    const id = userId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return this.repo.create(id, name.trim().slice(0, 24));
  }

  async getMe(userId: string): Promise<User | null> {
    return this.repo.get(userId);
  }

  async deposit(userId: string, amount: number): Promise<User | null> {
    if (amount <= 0) throw new Error('充值金额必须为正');
    return this.repo.addBalance(userId, amount);
  }

  async close(): Promise<void> {
    await this.repo.close();
  }
}
