import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('passkeys')
export class Passkey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ unique: true })
  credentialId: string;

  @Column({ type: 'text' })
  publicKey: string;

  @Column({ type: 'bigint', default: 0 })
  counter: number;

  @Column({ nullable: true })
  deviceType: string;

  @Column({ nullable: true })
  deviceName: string;

  @Column({ type: 'jsonb', nullable: true })
  transports: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastUsedAt: Date;

  @ManyToOne(() => User, (user) => user.passkeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}



