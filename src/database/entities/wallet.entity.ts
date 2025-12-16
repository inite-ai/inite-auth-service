import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ unique: true })
  address: string;

  @Column()
  chain: string; // 'ethereum', 'polygon', 'ton', etc.

  @Column({ type: 'text' })
  signature: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @CreateDateColumn()
  linkedAt: Date;

  @ManyToOne(() => User, (user) => user.wallets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}

