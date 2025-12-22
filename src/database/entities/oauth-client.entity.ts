import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('oauth_clients')
export class OAuthClient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  clientId: string;

  @Column({ select: false })
  clientSecretHash: string;

  @Column()
  name: string;

  @Column({ type: 'text', array: true })
  redirectUris: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  allowedScopes: string[];

  @Column({
    type: 'text',
    array: true,
    default: '{authorization_code,refresh_token}',
  })
  allowedGrants: string[];

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  privacyPolicyUrl: string;

  @Column({ nullable: true })
  termsOfServiceUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}



