import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Agreement } from '../agreements/schemas/agreement.schema';
import { Garment } from '../garments/schemas/garment.schema';
import { Notification } from '../notifications/schemas/notification.schema';
import { Proposal } from '../proposals/schemas/proposal.schema';
import { Sale } from '../sales/schemas/sale.schema';
import { Consignor } from '../users/schemas/consignor.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { User } from '../users/schemas/user.schema';
import {
  MERCHANT_KEY,
  SEED_AGREEMENTS,
  SEED_GARMENTS,
  SEED_NOTIFICATIONS,
  SEED_PROPOSALS,
  SEED_SALES,
} from './seed-data';

const SEED_PASSWORD = 'trama1234';

export interface SeedRefs {
  userByKey: Map<string, string>;
  salesPointByKey: Map<string, string>;
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Consignor.name) private readonly consignorModel: Model<Consignor>,
    @InjectModel(Merchant.name) private readonly merchantModel: Model<Merchant>,
    @InjectModel(Garment.name) private readonly garmentModel: Model<Garment>,
    @InjectModel(Proposal.name) private readonly proposalModel: Model<Proposal>,
    @InjectModel(Agreement.name) private readonly agreementModel: Model<Agreement>,
    @InjectModel(Sale.name) private readonly saleModel: Model<Sale>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
  ) {}

  async seedUsers(): Promise<SeedRefs> {
    await this.userModel.deleteMany({});
    const password = await bcrypt.hash(SEED_PASSWORD, 10);
    const userByKey = new Map<string, string>();
    const salesPointByKey = new Map<string, string>();

    const [ana, luis] = await this.consignorModel.create([
      {
        name: 'Ana Gómez',
        email: 'ana@example.com',
        phone: '351-2000001',
        verified: true,
        createdAt: new Date('2026-03-10'),
        accountStatus: 'active',
        location: { neighborhood: 'Nueva Córdoba', city: 'Córdoba', lat: -31.4281, lng: -64.1888 },
        dni: '32.111.222',
        password,
      },
      {
        name: 'Luis Ríos',
        email: 'luis@example.com',
        phone: '351-2000002',
        verified: false,
        createdAt: new Date('2026-04-02'),
        accountStatus: 'active',
        location: { neighborhood: 'Güemes', city: 'Córdoba', lat: -31.4256, lng: -64.195 },
        dni: '28.333.444',
        password,
      },
    ] as unknown as Consignor[]);
    userByKey.set('con-ana', ana.id);
    userByKey.set('con-luis', luis.id);

    const trama = await this.createMerchant({
      name: 'María López',
      email: 'contacto@tramaboutique.com',
      phone: '351-3000001',
      verified: true,
      createdAt: new Date('2026-01-15'),
      location: { neighborhood: 'Nueva Córdoba', city: 'Córdoba', lat: -31.4281, lng: -64.1888 },
      businessName: 'Trama Boutique',
      commissionConfig: { consignorPercentage: 30, merchantPercentage: 70 },
      terms: { saleWindowMonths: 3, graceMonths: 1, payoutDay: 20 },
      password,
      salesPoints: [
        {
          name: 'Trama Nueva Córdoba',
          address: 'Independencia 700',
          geo: { lat: -31.4281, lng: -64.1888 },
          phone: '351-3000001',
          receptionSchedule: {
            days: 'Lun a Vie',
            hours: '10 a 18 h',
            instructions: 'Preguntar por Recepción en planta baja.',
          },
        },
        {
          name: 'Trama Cerro',
          address: 'Rafael Núñez 4500',
          geo: { lat: -31.3605, lng: -64.2456 },
          phone: '351-3000003',
          receptionSchedule: {
            days: 'Mar a Sáb',
            hours: '11 a 19 h',
            instructions: 'Entregar en mostrador con DNI.',
          },
        },
      ],
    });
    userByKey.set(MERCHANT_KEY, trama.id);
    salesPointByKey.set('sp-nc', this.pointId(trama, 0));
    salesPointByKey.set('sp-cr', this.pointId(trama, 1));

    const vintage = await this.createMerchant({
      name: 'Sofía Paz',
      email: 'hola@vintagecba.com',
      phone: '351-3000002',
      verified: true,
      createdAt: new Date('2026-02-20'),
      location: { neighborhood: 'Güemes', city: 'Córdoba', lat: -31.4256, lng: -64.195 },
      businessName: 'Vintage Córdoba',
      commissionConfig: { consignorPercentage: 40, merchantPercentage: 60 },
      terms: { saleWindowMonths: 3, graceMonths: 1, payoutDay: 15 },
      password,
      salesPoints: [
        {
          name: 'Vintage Güemes',
          address: 'Belgrano 800',
          geo: { lat: -31.4256, lng: -64.195 },
          phone: '351-3000002',
          receptionSchedule: {
            days: 'Lun a Sáb',
            hours: '10 a 20 h',
            instructions: 'Timbre local 2.',
          },
        },
      ],
    });
    userByKey.set('mer-vintage', vintage.id);
    salesPointByKey.set('sp-gu', this.pointId(vintage, 0));

    this.logger.log('Seeded 2 consignors and 2 merchants');
    return { userByKey, salesPointByKey };
  }

  async seedAll(): Promise<void> {
    const { userByKey, salesPointByKey } = await this.seedUsers();
    await Promise.all([
      this.garmentModel.deleteMany({}),
      this.proposalModel.deleteMany({}),
      this.agreementModel.deleteMany({}),
      this.saleModel.deleteMany({}),
      this.notificationModel.deleteMany({}),
    ]);

    const merchantId = userByKey.get(MERCHANT_KEY);
    const garmentByKey = new Map<string, string>();

    for (const data of SEED_GARMENTS) {
      const { key, consignorKey, salesPointKey, ...rest } = data;
      const garment = await this.garmentModel.create({
        ...rest,
        consignorId: userByKey.get(consignorKey),
        merchantId,
        salesPointId: salesPointByKey.get(salesPointKey),
      } as unknown as Garment);
      garmentByKey.set(key, garment.id);
    }

    await this.proposalModel.create(
      SEED_PROPOSALS.map(({ garmentKey, ...rest }) => ({
        ...rest,
        garmentId: garmentByKey.get(garmentKey),
      })) as unknown as Proposal[],
    );

    await this.agreementModel.create(
      SEED_AGREEMENTS.map(({ garmentKey, ...rest }) => ({
        ...rest,
        garmentId: garmentByKey.get(garmentKey),
      })) as unknown as Agreement[],
    );

    await this.saleModel.create(
      SEED_SALES.map(({ garmentKey, ...rest }) => ({
        ...rest,
        garmentId: garmentByKey.get(garmentKey),
      })) as unknown as Sale[],
    );

    await this.notificationModel.create(
      SEED_NOTIFICATIONS.map(({ userKey, garmentKey, base, type, text, date }) => ({
        userId: userByKey.get(userKey),
        type,
        text,
        date,
        read: false,
        target: `${base}/garment/${garmentByKey.get(garmentKey)}`,
      })) as unknown as Notification[],
    );

    this.logger.log(
      `Seeded ${SEED_GARMENTS.length} garments, ${SEED_PROPOSALS.length} proposals, ${SEED_AGREEMENTS.length} agreements, ${SEED_SALES.length} sales, ${SEED_NOTIFICATIONS.length} notifications`,
    );
  }

  private pointId(merchant: MerchantDocument, index: number): string {
    return (merchant.salesPoints[index] as unknown as { id: string }).id;
  }

  private async createMerchant(
    data: Record<string, unknown> & { salesPoints: Record<string, unknown>[] },
  ): Promise<MerchantDocument> {
    const { salesPoints, ...merchantData } = data;
    const merchant: MerchantDocument = new this.merchantModel({
      ...merchantData,
      accountStatus: 'active',
    } as unknown as Merchant);
    merchant.salesPoints = salesPoints.map(
      (point) => ({ ...point, merchantId: merchant.id }),
    ) as never;
    await merchant.save();
    return merchant;
  }
}
