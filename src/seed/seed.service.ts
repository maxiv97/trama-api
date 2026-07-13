import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Consignor } from '../users/schemas/consignor.schema';
import { Merchant, MerchantDocument } from '../users/schemas/merchant.schema';
import { User } from '../users/schemas/user.schema';

const SEED_PASSWORD = 'trama1234';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Consignor.name) private readonly consignorModel: Model<Consignor>,
    @InjectModel(Merchant.name) private readonly merchantModel: Model<Merchant>,
  ) {}

  async seedUsers(): Promise<void> {
    await this.userModel.deleteMany({});
    const password = await bcrypt.hash(SEED_PASSWORD, 10);

    await this.consignorModel.create([
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

    await this.createMerchant({
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

    await this.createMerchant({
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

    this.logger.log('Seeded 2 consignors and 2 merchants');
  }

  private async createMerchant(
    data: Record<string, unknown> & { salesPoints: Record<string, unknown>[] },
  ): Promise<void> {
    const { salesPoints, ...merchantData } = data;
    const merchant: MerchantDocument = new this.merchantModel({
      ...merchantData,
      accountStatus: 'active',
    } as unknown as Merchant);
    merchant.salesPoints = salesPoints.map(
      (point) => ({ ...point, merchantId: merchant.id }),
    ) as never;
    await merchant.save();
  }
}
