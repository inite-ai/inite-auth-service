import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { OAuthClient } from './oauth-client.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  tokenHash: string;

  @Column()
  userId: string;

  @Column()
  clientId: string;

  @Column({ nullable: true })
  scope: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'uuid', nullable: true })
  rotatedFrom: string;

  @Column({ default: false })
  revoked: boolean;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => OAuthClient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId', referencedColumnName: 'clientId' })
  client: OAuthClient;
}



