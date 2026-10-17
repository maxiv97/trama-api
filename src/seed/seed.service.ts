import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Agreement } from '../agreements/schemas/agreement.schema';
import { Garment } from '../garments/schemas/garment.schema';
import { Notification } from '../notifications/schemas/notification.schema';
import { Proposal } from '../proposals/schemas/proposal.schema';
import { Reception } from '../receptions/schemas/reception.schema';
import { Sale } from '../sales/schemas/sale.schema';
import { CategoriesService } from '../categories/categories.service';
import { Consignor } from '../users/schemas/consignor.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { User } from '../users/schemas/user.schema';
import {
  buildDemoDataset,
  DEMO_CONSIGNOR_PERCENTAGE,
  DEMO_CONSIGNORS,
  DEMO_MERCHANT_KEY,
  DEMO_MERCHANT_EMAIL,
  DEMO_MERCHANT_PERCENTAGE,
  DEMO_SALES_POINTS,
  DEMO_TERMS,
} from './demo-data';
import {
  MERCHANT_KEY,
  SEED_AGREEMENTS,
  SEED_GARMENTS,
  SEED_NOTIFICATIONS,
  SEED_PROPOSALS,
  SEED_SALES,
} from './seed-data';

const SEED_PASSWORD = 'trama1234';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedRefs {
  userByKey: Map<string, string>;
  salesPointByKey: Map<string, string>;
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Consignor.name)
    private readonly consignorModel: Model<Consignor>,
    @InjectModel(Merchant.name) private readonly merchantModel: Model<Merchant>,
    @InjectModel(Garment.name) private readonly garmentModel: Model<Garment>,
    @InjectModel(Proposal.name) private readonly proposalModel: Model<Proposal>,
    @InjectModel(Agreement.name)
    private readonly agreementModel: Model<Agreement>,
    @InjectModel(Sale.name) private readonly saleModel: Model<Sale>,
    @InjectModel(Reception.name)
    private readonly receptionModel: Model<Reception>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    private readonly categories: CategoriesService,
  ) {}

  async seedUsers(): Promise<SeedRefs> {
    await this.categories.seedBase();
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
        location: {
          neighborhood: 'Nueva Córdoba',
          city: 'Córdoba',
          lat: -31.4281,
          lng: -64.1888,
        },
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
        location: {
          neighborhood: 'Güemes',
          city: 'Córdoba',
          lat: -31.4256,
          lng: -64.195,
        },
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
      location: {
        neighborhood: 'Nueva Córdoba',
        city: 'Córdoba',
        lat: -31.4281,
        lng: -64.1888,
      },
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
      location: {
        neighborhood: 'Güemes',
        city: 'Córdoba',
        lat: -31.4256,
        lng: -64.195,
      },
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
      SEED_NOTIFICATIONS.map(
        ({ userKey, garmentKey, base, type, text, date }) => ({
          userId: userByKey.get(userKey),
          type,
          text,
          date,
          read: false,
          target: `${base}/garment/${garmentByKey.get(garmentKey)}`,
        }),
      ) as unknown as Notification[],
    );

    this.logger.log(
      `Seeded ${SEED_GARMENTS.length} garments, ${SEED_PROPOSALS.length} proposals, ${SEED_AGREEMENTS.length} agreements, ${SEED_SALES.length} sales, ${SEED_NOTIFICATIONS.length} notifications`,
    );
  }

  /**
   * Populates one richly-detailed test merchant ("Segunda Vuelta") with ~100
   * garments spread over the last 6 months, touching every GarmentStatus, so
   * the reports/dashboards have real volume to chart. Additive and
   * idempotent: it only ever touches the demo merchant/consignors it created
   * on a previous run (matched by their fixed emails) — running it again
   * regenerates a fresh dataset instead of piling up duplicates, and it
   * never touches the unrelated data from seedAll().
   */
  async seedDemoMerchant(): Promise<void> {
    await this.categories.seedBase();
    await this.clearPriorDemoRun();

    const password = await bcrypt.hash(SEED_PASSWORD, 10);
    const now = new Date();
    const longAgo = new Date(now.getTime() - 220 * DAY_MS);
    const userByKey = new Map<string, string>();
    const salesPointByKey = new Map<string, string>();

    const consignorDocs = await this.consignorModel.create(
      DEMO_CONSIGNORS.map((c) => ({
        name: c.name,
        email: c.email,
        phone: c.phone,
        verified: c.verified,
        createdAt: longAgo,
        accountStatus: 'active',
        location: {
          neighborhood: c.neighborhood,
          city: c.city,
          lat: c.lat,
          lng: c.lng,
        },
        dni: c.dni,
        password,
      })) as unknown as Consignor[],
    );
    consignorDocs.forEach((doc, i) =>
      userByKey.set(DEMO_CONSIGNORS[i].key, doc.id),
    );

    const merchant = await this.createMerchant({
      name: 'Equipo Segunda Vuelta',
      email: DEMO_MERCHANT_EMAIL,
      phone: '351-4200000',
      verified: true,
      createdAt: longAgo,
      accountStatus: 'active',
      location: {
        neighborhood: 'Nueva Córdoba',
        city: 'Córdoba',
        lat: -31.4278,
        lng: -64.1872,
      },
      businessName: 'Segunda Vuelta',
      commissionConfig: {
        consignorPercentage: DEMO_CONSIGNOR_PERCENTAGE,
        merchantPercentage: DEMO_MERCHANT_PERCENTAGE,
      },
      terms: DEMO_TERMS,
      password,
      salesPoints: DEMO_SALES_POINTS.map((sp) => ({
        name: sp.name,
        address: sp.address,
        geo: { lat: sp.lat, lng: sp.lng },
        phone: sp.phone,
        receptionSchedule: {
          days: sp.days,
          hours: sp.hours,
          instructions: sp.instructions,
        },
      })),
    });
    userByKey.set(DEMO_MERCHANT_KEY, merchant.id);
    DEMO_SALES_POINTS.forEach((sp, i) =>
      salesPointByKey.set(sp.key, this.pointId(merchant, i)),
    );

    const dataset = buildDemoDataset(now);
    const merchantId = merchant.id;
    const garmentByKey = new Map<string, string>();

    for (const g of dataset.garments) {
      const { key, consignorKey, salesPointKey, ...rest } = g;
      const garment = await this.garmentModel.create({
        ...rest,
        consignorId: userByKey.get(consignorKey),
        merchantId,
        salesPointId: salesPointByKey.get(salesPointKey),
      } as unknown as Garment);
      garmentByKey.set(key, garment.id);
    }

    if (dataset.proposals.length) {
      await this.proposalModel.create(
        dataset.proposals.map(({ garmentKey, ...rest }) => ({
          ...rest,
          garmentId: garmentByKey.get(garmentKey),
        })) as unknown as Proposal[],
      );
    }

    if (dataset.agreements.length) {
      await this.agreementModel.create(
        dataset.agreements.map(({ garmentKey, ...rest }) => ({
          ...rest,
          garmentId: garmentByKey.get(garmentKey),
        })) as unknown as Agreement[],
      );
    }

    if (dataset.receptions.length) {
      await this.receptionModel.create(
        dataset.receptions.map(({ garmentKey, salesPointKey, ...rest }) => ({
          ...rest,
          garmentId: garmentByKey.get(garmentKey),
          salesPointId: salesPointByKey.get(salesPointKey),
        })) as unknown as Reception[],
      );
    }

    if (dataset.sales.length) {
      await this.saleModel.create(
        dataset.sales.map(({ garmentKey, ...rest }) => ({
          ...rest,
          garmentId: garmentByKey.get(garmentKey),
        })) as unknown as Sale[],
      );
    }

    if (dataset.notifications.length) {
      await this.notificationModel.create(
        dataset.notifications.map(
          ({ userKey, garmentKey, base, type, text, date, read }) => ({
            userId: userByKey.get(userKey),
            type,
            text,
            date,
            read,
            target: `${base}/garment/${garmentByKey.get(garmentKey)}`,
          }),
        ) as unknown as Notification[],
      );
    }

    this.logger.log(
      `Seeded demo merchant "Segunda Vuelta" — ${DEMO_CONSIGNORS.length} consignors, ` +
        `${dataset.garments.length} garments, ${dataset.proposals.length} proposals, ` +
        `${dataset.agreements.length} agreements, ${dataset.receptions.length} receptions, ` +
        `${dataset.sales.length} sales, ${dataset.notifications.length} notifications`,
    );
  }

  /** Deletes only what a previous seedDemoMerchant() run created, matched by fixed emails. */
  private async clearPriorDemoRun(): Promise<void> {
    const demoEmails = [
      DEMO_MERCHANT_EMAIL,
      ...DEMO_CONSIGNORS.map((c) => c.email),
    ];
    const staleUsers = await this.userModel
      .find({ email: { $in: demoEmails } })
      .exec();
    if (staleUsers.length === 0) return;

    const staleUserIds = staleUsers.map((u) => u.id);
    const staleGarments = await this.garmentModel
      .find({
        $or: [
          { merchantId: { $in: staleUserIds } },
          { consignorId: { $in: staleUserIds } },
        ],
      })
      .exec();
    const staleGarmentIds = staleGarments.map((g) => g.id);

    await Promise.all([
      this.proposalModel.deleteMany({ garmentId: { $in: staleGarmentIds } }),
      this.agreementModel.deleteMany({ garmentId: { $in: staleGarmentIds } }),
      this.receptionModel.deleteMany({ garmentId: { $in: staleGarmentIds } }),
      this.saleModel.deleteMany({ garmentId: { $in: staleGarmentIds } }),
      this.notificationModel.deleteMany({ userId: { $in: staleUserIds } }),
    ]);
    await this.garmentModel.deleteMany({ _id: { $in: staleGarmentIds } });
    await this.userModel.deleteMany({ _id: { $in: staleUserIds } });
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
    merchant.salesPoints = salesPoints.map((point) => ({
      ...point,
      merchantId: merchant.id,
    })) as never;
    await merchant.save();
    return merchant;
  }
}
